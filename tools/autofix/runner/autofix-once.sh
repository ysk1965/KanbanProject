#!/usr/bin/env bash
#
# 자동수정 1건 처리 — 폴링 루프(bridge-autofix-runner.sh)가 claim한 작업 명세를 stdin으로 받는다.
#
#   echo "$JOB_JSON" | ./autofix-once.sh [설정파일]
#
# 손으로 한 건만 돌려보려면 (BRIDGE에 회신하지 않는다):
#   NO_REPORT=1 ./autofix-once.sh ~/bridge-autofix/runner.conf <<'EOF'
#   {"job_id":"","jira_issue_key":"QASA-40","issue_title":"...","issue_body":"...",
#    "verification":"","test_infra":"NONE","repo_full_name":"org/repo",
#    "base_ref":"develop","branch":"autofix/QASA-40","timeout_minutes":60}
#   EOF
#
# 어떤 경로로 끝나든 BRIDGE에 결과를 회신한다(EXIT 트랩). 회신이 없으면 그 한 건이 서버의
# 회수 시각까지 보드의 큐 전체를 막는다.

set -uo pipefail

CONF="${1:-$HOME/bridge-autofix/runner.conf}"
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  set -a; source "$CONF"; set +a
fi

: "${PROJECT_DIR:?PROJECT_DIR 미설정}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname -s)}"
NO_REPORT="${NO_REPORT:-0}"

JOB=$(cat)
field() { echo "$JOB" | jq -r --arg k "$1" '.[$k] // ""'; }

JOB_ID=$(field job_id)
ISSUE_KEY=$(field jira_issue_key)
ISSUE_TITLE=$(field issue_title)
ISSUE_BODY=$(field issue_body)
VERIFICATION=$(field verification)
TEST_INFRA=$(field test_infra)
REPO_FULL_NAME=$(field repo_full_name)
BASE_REF=$(field base_ref)
BRANCH=$(field branch)
TIMEOUT_MINUTES=$(echo "$JOB" | jq -r '.timeout_minutes // 60')

[ -n "$ISSUE_KEY" ] || { echo "작업 명세에 jira_issue_key가 없다"; exit 1; }
[ -n "$BRANCH" ] || BRANCH="autofix/$ISSUE_KEY"
[ -n "$BASE_REF" ] || BASE_REF="develop"

AGENT_LOG=$(mktemp -t autofix-agent)
EXCERPT_FILE="$AGENT_LOG"
RESULT="failed"
FAILURE_REASON="러너가 결과를 남기지 못한 채 종료했습니다"
PR_URL=""
HB_PID=""

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { FAILURE_REASON="$1"; log "실패: $1"; exit 1; }

# ── BRIDGE 회신 ────────────────────────────────

report() {
  [ "$NO_REPORT" = "1" ] && { log "NO_REPORT=1 — 회신 생략 (result=$RESULT)"; return; }
  [ -n "${BRIDGE_URL:-}" ] && [ -n "${BRIDGE_BOARD_ID:-}" ] && [ -n "${BRIDGE_TOKEN:-}" ] || {
    log "BRIDGE 설정이 없어 회신하지 못한다 (result=$RESULT)"; return; }

  local excerpt=""
  [ -f "$EXCERPT_FILE" ] && excerpt=$(tail -c 6000 "$EXCERPT_FILE")

  curl -sS -m 30 -X POST \
    "$BRIDGE_URL/api/v1/jira/autofix/callback/$BRIDGE_BOARD_ID" \
    -H "Authorization: Bearer $BRIDGE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
        --arg job "$JOB_ID" --arg key "$ISSUE_KEY" --arg result "$RESULT" \
        --arg pr "$PR_URL" --arg reason "$FAILURE_REASON" --arg log "$excerpt" \
        '{job_id:$job, issue_key:$key, result:$result, pr_url:$pr,
          failure_reason:(if $result=="failed" then $reason else "" end), log_excerpt:$log}')" \
    >/dev/null || log "회신 실패 — 서버는 이 건을 타임아웃으로 회수하게 된다"
}

# 성공/실패/중단 어느 쪽이든 회신하고 작업 트리를 되돌린다.
# 정리를 건너뛰면 다음 실행이 "작업 트리가 더럽다"로 막힌다.
cleanup() {
  local code=$?
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  [ "$code" -ne 0 ] && [ "$RESULT" = "failed" ] && log "종료 코드 $code"

  if [ -d "$PROJECT_DIR/.git" ]; then
    git -C "$PROJECT_DIR" reset --hard >/dev/null 2>&1
    git -C "$PROJECT_DIR" clean -fd -e Library -e Temp -e obj >/dev/null 2>&1
    git -C "$PROJECT_DIR" checkout "$BASE_REF" >/dev/null 2>&1
  fi

  report
  rm -f "$AGENT_LOG"
  exit "$code"
}
trap cleanup EXIT

heartbeat_loop() {
  while true; do
    sleep 60
    curl -sS -m 15 -X POST \
      "$BRIDGE_URL/api/v1/jira/autofix/runner/$BRIDGE_BOARD_ID/heartbeat" \
      -H "Authorization: Bearer $BRIDGE_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg n "$RUNNER_NAME" '{runner_name:$n}')" >/dev/null 2>&1 || true
  done
}

# macOS에는 GNU timeout이 없다. 백그라운드로 띄우고 직접 감시한다.
run_with_timeout() {
  local minutes=$1; shift
  "$@" & local pid=$!
  local waited=0 limit=$((minutes * 60))
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5
    waited=$((waited + 5))
    if [ "$waited" -ge "$limit" ]; then
      kill -TERM "$pid" 2>/dev/null; sleep 5; kill -KILL "$pid" 2>/dev/null
      return 124
    fi
  done
  wait "$pid"
}

# ── 사전 점검 ──────────────────────────────────

cd "$PROJECT_DIR" || fail "PROJECT_DIR로 이동할 수 없습니다: $PROJECT_DIR"

# 러너가 붙어 있는 저장소와 작업이 지정한 저장소가 다르면 엉뚱한 곳에 PR이 열린다.
# 고칠 수 없는 설정 오류이므로 아무것도 건드리지 않고 끝낸다.
if [ -n "$REPO_FULL_NAME" ]; then
  origin=$(git remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#^.*[:/]\([^/]*/[^/]*\)$#\1#')
  if [ "$(echo "$origin" | tr 'A-Z' 'a-z')" != "$(echo "$REPO_FULL_NAME" | tr 'A-Z' 'a-z')" ]; then
    fail "러너가 붙은 저장소($origin)가 작업 대상($REPO_FULL_NAME)과 다릅니다"
  fi
fi

# Unity MCP는 실행 중인 Editor에 붙는다. 꺼져 있으면 진단도 컴파일 확인도 못 한다.
pgrep -x Unity >/dev/null || fail "Unity Editor가 실행 중이 아닙니다. MCP가 붙을 대상이 없습니다"

# 이전 실행이 남긴 변경이 있으면 이번 수정과 섞여 잘못된 PR이 나간다.
if [ -n "$(git status --porcelain)" ]; then
  git status --porcelain | head -20
  fail "작업 트리가 더럽습니다. 이전 실행이 정리되지 않았습니다"
fi

[ -x tools/autofix/verify-compile.sh ] || \
  fail "tools/autofix/verify-compile.sh 가 없습니다. 검증 없이 PR을 만들지 않습니다"

[ -n "${BRIDGE_TOKEN:-}" ] && [ "$NO_REPORT" != "1" ] && { heartbeat_loop & HB_PID=$!; }

log "=== $ISSUE_KEY / $REPO_FULL_NAME / $BASE_REF → $BRANCH (상한 ${TIMEOUT_MINUTES}분) ==="

# ── 브랜치 ────────────────────────────────────

git fetch origin "$BASE_REF" --quiet || fail "origin/$BASE_REF 를 가져오지 못했습니다"
git checkout -B "$BRANCH" "origin/$BASE_REF" --quiet || fail "브랜치 $BRANCH 를 만들지 못했습니다"

# ── 수정 시도 ──────────────────────────────────

PROMPT_FILE=$(mktemp -t autofix-prompt)
{
  cat <<'PROMPT'
아래 QA 이슈를 이 Unity 저장소에서 고쳐라.

제약:
- 이슈에 적힌 증상과 직접 관련된 최소 변경만 한다. 리팩터링·정리·포맷팅 금지
- 기대 동작이 이슈에서 확정되지 않으면 아무것도 고치지 말고 그 이유를 말하고 끝낸다
- 에셋 바이너리(.unity, .prefab, .asset)는 건드리지 않는다. 코드만 수정한다
- Unity MCP로 콘솔 에러와 관련 스크립트를 먼저 확인한 뒤 수정한다
PROMPT
  echo ""
  echo "이슈 $ISSUE_KEY: $ISSUE_TITLE"
  echo ""
  echo "$ISSUE_BODY"
  echo ""
  echo "트리아지가 본 검증 수단: $VERIFICATION"
  [ "$TEST_INFRA" = "NONE" ] && echo "이 저장소에는 테스트가 없다. 테스트를 새로 만들지 말고 코드 수정만 한다."
} > "$PROMPT_FILE"

log "에이전트 실행"
run_with_timeout "$TIMEOUT_MINUTES" \
  claude -p "$(cat "$PROMPT_FILE")" \
    --allowedTools "Read,Grep,Glob,Edit,mcp__unity" \
    --permission-mode acceptEdits > "$AGENT_LOG" 2>&1
agent_rc=$?
rm -f "$PROMPT_FILE"
tail -c 2000 "$AGENT_LOG"

if [ "$agent_rc" -eq 124 ]; then
  fail "에이전트가 ${TIMEOUT_MINUTES}분 안에 끝나지 않아 중단했습니다"
elif [ "$agent_rc" -ne 0 ]; then
  fail "에이전트가 오류로 종료했습니다 (exit $agent_rc)"
fi

if [ -z "$(git status --porcelain)" ]; then
  log "변경 없음 — 에이전트가 고칠 수 없다고 판단했다"
  RESULT="no_change"
  exit 0
fi

git status --porcelain

# ── 컴파일 확인 ────────────────────────────────
#
# Editor가 프로젝트를 잠그고 있어 -batchmode를 쓸 수 없다. 확인도 실행 중인 Editor를 통해야 하고,
# 그 방법은 설치한 MCP 서버마다 다르다 — 그래서 계약(exit 0/1)만 정해 두고 구현은 대상 저장소에 둔다.
# 저장소에 테스트가 0개인 동안은 이 컴파일 통과가 유일한 자동 게이트다.

VERIFY_LOG=$(mktemp -t autofix-verify)
log "컴파일 확인"
if ! run_with_timeout 15 ./tools/autofix/verify-compile.sh > "$VERIFY_LOG" 2>&1; then
  tail -c 2000 "$VERIFY_LOG"
  cat "$VERIFY_LOG" >> "$AGENT_LOG"
  fail "컴파일 검증에 실패했습니다: $(tail -c 300 "$VERIFY_LOG" | tr '\n' ' ')"
fi
cat "$VERIFY_LOG" >> "$AGENT_LOG"
rm -f "$VERIFY_LOG"

# ── PR ────────────────────────────────────────

git config user.name  "bridge-autofix[bot]"
git config user.email "bridge-autofix@users.noreply.github.com"
git add -A
git commit -q -m "fix($ISSUE_KEY): $ISSUE_TITLE" || fail "커밋에 실패했습니다"
git push -u origin "$BRANCH" --quiet || fail "브랜치 push에 실패했습니다"

PR_BODY=$(cat <<EOF
BRIDGE 자동수정이 생성한 PR입니다. **머지 전 반드시 사람이 검토하세요.**

- 이슈: $ISSUE_KEY
- 트리아지 검증 수단: ${VERIFICATION:-없음}
- 자동 검증 범위: 컴파일 통과까지만. 동작은 확인되지 않았습니다.
- 러너: $RUNNER_NAME

<details><summary>에이전트 로그</summary>

\`\`\`
$(tail -c 8000 "$AGENT_LOG")
\`\`\`

</details>
EOF
)

PR_URL=$(gh pr create \
  --base "$BASE_REF" \
  --head "$BRANCH" \
  --title "[$ISSUE_KEY] $ISSUE_TITLE" \
  --body "$PR_BODY" 2>&1) || fail "PR 생성에 실패했습니다: $(echo "$PR_URL" | tail -c 300)"

log "PR: $PR_URL"
RESULT="pr"
exit 0
