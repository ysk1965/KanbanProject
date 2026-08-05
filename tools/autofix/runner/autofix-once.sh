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

SPOOL_DIR="${SPOOL_DIR:-$HOME/bridge-autofix/spool}"

# 락은 워크트리 하나에 하나다. .git 안에 두면 git clean 이 건드리지 않고, 클론이 여러 개여도
# 서로 막지 않는다. .git 이 없는 잘못된 설정에서는 락 실패가 "다른 실행 중"으로 오진되므로
# 경로를 TMPDIR로 돌린다 — 진짜 원인(저장소 아님)은 뒤의 사전 점검이 말해준다.
if [ -d "$PROJECT_DIR/.git" ]; then
  LOCK_DIR="${LOCK_DIR:-$PROJECT_DIR/.git/bridge-autofix.lock}"
else
  LOCK_DIR="${LOCK_DIR:-${TMPDIR:-/tmp}/bridge-autofix-$(printf '%s' "$PROJECT_DIR" | shasum | cut -c1-12).lock}"
fi

AGENT_LOG=$(mktemp -t autofix-agent)
EXCERPT_FILE="$AGENT_LOG"
RESULT="failed"
FAILURE_REASON="러너가 결과를 남기지 못한 채 종료했습니다"
PR_URL=""
HB_PID=""
HAVE_LOCK=0

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { FAILURE_REASON="$1"; log "실패: $1"; exit 1; }

# ── BRIDGE 회신 ────────────────────────────────

callback_payload() {
  local excerpt=""
  [ -f "$EXCERPT_FILE" ] && excerpt=$(tail -c 6000 "$EXCERPT_FILE")
  jq -n \
    --arg job "$JOB_ID" --arg key "$ISSUE_KEY" --arg result "$RESULT" \
    --arg pr "$PR_URL" --arg reason "$FAILURE_REASON" --arg log "$excerpt" \
    '{job_id:$job, issue_key:$key, result:$result, pr_url:$pr,
      failure_reason:(if $result=="failed" then $reason else "" end), log_excerpt:$log}'
}

# --fail 이 없으면 curl 은 502나 401을 받고도 exit 0 이다. ALB가 잠깐 타깃을 잃는 구간이
# 실제로 있었고, 그때 회신을 성공으로 착각하면 결과가 조용히 사라진다 — 재시도의 전제가 깨진다.
post_callback() {
  curl -sS --fail -m 30 -o /dev/null -X POST \
    "$BRIDGE_URL/api/v1/jira/autofix/callback/$BRIDGE_BOARD_ID" \
    -H "Authorization: Bearer $BRIDGE_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary "$1"
}

# 회신은 이 실행에서 유일하게 "잃어버리면 안 되는" 통신이다.
#
# 서버는 회신이 없으면 90분 뒤 TIMED_OUT으로 회수하는데, existsActiveForIssue가 종료 상태까지
# "이미 처리함"으로 세기 때문에 그 이슈는 사람이 작업을 취소하기 전까지 다시 큐에 담기지 않는다.
# 즉 회신 한 번을 놓치면 PR은 열려 있는데 보드는 실패라 말하고, 그 이슈는 영구히 빠진다.
# 그래서 세 번 시도하고, 그래도 안 되면 스풀에 남겨 폴링 루프가 계속 재전송한다.
report() {
  [ "$NO_REPORT" = "1" ] && { log "NO_REPORT=1 — 회신 생략 (result=$RESULT)"; return; }
  [ -n "${BRIDGE_URL:-}" ] && [ -n "${BRIDGE_BOARD_ID:-}" ] && [ -n "${BRIDGE_TOKEN:-}" ] || {
    log "BRIDGE 설정이 없어 회신하지 못한다 (result=$RESULT)"; return; }

  local payload
  payload=$(callback_payload)

  local delay
  for delay in 0 5 15; do
    [ "$delay" -gt 0 ] && sleep "$delay"
    if post_callback "$payload"; then
      [ "$delay" -gt 0 ] && log "회신 성공 (재시도 후)"
      return 0
    fi
    log "회신 실패 — 재시도"
  done

  # 여기까지 왔으면 BRIDGE가 죽었거나 네트워크가 끊긴 것이다. 결과를 버리지 않고 남긴다.
  mkdir -p "$SPOOL_DIR" 2>/dev/null
  local spooled="$SPOOL_DIR/$(date -u +%Y%m%dT%H%M%S)-${ISSUE_KEY}.json"
  if printf '%s' "$payload" > "$spooled" 2>/dev/null; then
    log "회신 실패 — 스풀에 보관했다: $spooled (폴링 루프가 재전송한다)"
  else
    log "회신 실패 — 스풀 기록도 실패했다. 서버는 이 건을 타임아웃으로 회수하게 된다"
  fi
  return 1
}

# 성공/실패/중단 어느 쪽이든 회신하고 작업 트리를 되돌린다.
# 정리를 건너뛰면 다음 실행이 "작업 트리가 더럽다"로 막힌다.
#
# 워크트리를 되돌리는 것은 **락을 쥔 실행만** 한다. 락을 못 잡고 끝난 실행이 여기서 reset을
# 돌리면, 지금 돌고 있는 다른 실행의 수정본을 통째로 날린다 — 막으려던 사고를 정리 코드가
# 대신 저지르는 꼴이 된다.
cleanup() {
  local code=$?
  [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null
  [ "$code" -ne 0 ] && [ "$RESULT" = "failed" ] && log "종료 코드 $code"

  if [ "$HAVE_LOCK" = "1" ]; then
    if [ -d "$PROJECT_DIR/.git" ]; then
      git -C "$PROJECT_DIR" reset --hard >/dev/null 2>&1
      git -C "$PROJECT_DIR" clean -fd -e Library -e Temp -e obj >/dev/null 2>&1
      git -C "$PROJECT_DIR" checkout "$BASE_REF" >/dev/null 2>&1
    fi
    rm -rf "$LOCK_DIR" 2>/dev/null
  fi

  report
  rm -f "$AGENT_LOG"
  exit "$code"
}
trap cleanup EXIT

# ── 단독 실행 보장 ──────────────────────────────
#
# 폴링 루프는 한 건씩 동기로 돌지만, 손으로 돌리는 경로(이 파일 헤더가 안내한다)가 그 직렬화를
# 우회한다. 두 실행이 같은 PROJECT_DIR을 공유하면 먼저 끝난 쪽의 cleanup이 상대의 작업물을
# reset --hard 로 지우고, 타이밍이 나쁘면 git add 와 commit 사이에 트리가 비워진다.
# Unity Editor가 디렉터리를 잠그고 있어 워크트리를 늘릴 수는 없으므로, 락으로 직렬화한다.
#
# mkdir 은 원자적이다. flock(1)은 macOS 기본 설치에 없다.
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    HAVE_LOCK=1
    return 0
  fi

  # 남아 있는 락의 주인이 살아 있는지 본다. 죽었으면(맥 강제종료 등) 회수한다 —
  # 아니면 사람이 손으로 지우기 전까지 러너가 영영 멈춘다.
  local holder
  holder=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    return 1
  fi

  log "주인 없는 락을 회수한다 (pid=${holder:-알 수 없음})"
  rm -rf "$LOCK_DIR" 2>/dev/null
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    HAVE_LOCK=1
    return 0
  fi
  return 1
}

acquire_lock || fail "다른 자동수정 실행이 이 저장소를 사용 중입니다 (락: $LOCK_DIR)"

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

# 에디터가 열어둔 프로젝트에서 작업하므로, 러너가 도는 동안 Auto Refresh가 에셋을 재직렬화한다
# (브랜치 전환 직후가 특히 그렇다). 사람이 만지지 않아도 작업 트리가 더러워진다는 뜻이다.
#
# 그대로 두면 두 군데가 조용히 망가진다:
#   1. 사전 점검이 "이전 실행이 정리되지 않았다"로 막힌다 — 정리는 됐는데 에디터가 다시 더럽혔다.
#   2. 에이전트가 아무것도 안 고쳤는데 트리가 더러워 "변경 없음" 판정이 뒤집히고,
#      git add -A가 그 에셋을 담아 **내용이 없는 PR**이 열린다. (실제로 QASA-70에서 그랬다)
#
# 프롬프트가 에이전트에게 금지한 확장자이므로, 여기서 되돌려도 잃을 수정은 없다.
revert_editor_churn() {
  local entry path
  while IFS= read -r -d '' entry; do
    path="${entry:3}"
    case "$path" in
      *.unity|*.prefab|*.asset|*.unity.meta|*.prefab.meta|*.asset.meta) ;;
      *) continue ;;
    esac
    if [ "${entry:0:2}" = "??" ]; then rm -f "$path"; else git checkout -- "$path" 2>/dev/null; fi
    log "에디터가 만든 변경으로 보고 되돌렸다: $path"
  done < <(git status --porcelain -z)
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

# Unity MCP는 실행 중인 Editor에 붙는다. 꺼져 있으면 에이전트가 콘솔을 못 읽어 진단 품질이
# 떨어지지만, 게이트(batchmode 컴파일)는 별도 클론에서 돌아 영향이 없다.
# 그래서 여기서 멈추지 않는다 — Editor가 죽었다고 큐 전체를 세우는 편이 더 나쁘다.
if ! pgrep -x Unity >/dev/null; then
  log "경고: Unity Editor가 실행 중이 아니다. MCP 진단 없이 소스만 보고 수정하게 된다."
fi

# 이전 실행이 남긴 변경이 있으면 이번 수정과 섞여 잘못된 PR이 나간다.
revert_editor_churn
if [ -n "$(git status --porcelain)" ]; then
  git status --porcelain | head -20
  fail "작업 트리가 더럽습니다. 이전 실행이 정리되지 않았습니다"
fi

# 검증 스크립트는 러너 쪽(~/bridge-autofix)에 두는 것이 기본이다 — 대상 게임 저장소에
# 파일을 심지 않아도 되고, 러너를 고칠 때 게임 저장소에 PR을 올릴 필요가 없다.
# 저장소가 자체 스크립트를 제공하면 그쪽을 쓴다.
VERIFY_SCRIPT="${VERIFY_SCRIPT:-$HOME/bridge-autofix/verify-compile.sh}"
[ -x "$VERIFY_SCRIPT" ] || VERIFY_SCRIPT="$PROJECT_DIR/tools/autofix/verify-compile.sh"
[ -x "$VERIFY_SCRIPT" ] || \
  fail "컴파일 검증 스크립트를 찾지 못했습니다($VERIFY_SCRIPT). 검증 없이 PR을 만들지 않습니다"

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

# 판정 전에 에디터 몫을 걷어낸다 — 이 순서가 뒤바뀌면 빈 PR이 열린다.
revert_editor_churn

if [ -z "$(git status --porcelain)" ]; then
  log "변경 없음 — 에이전트가 고칠 수 없다고 판단했다"
  RESULT="no_change"
  exit 0
fi

git status --porcelain

# ── 컴파일 확인 ────────────────────────────────
#
# 저장소에 테스트가 0개인 동안 이 컴파일 통과가 유일한 자동 게이트다. 그래서 이 판정만큼은
# LLM도 MCP도 끼지 않는 경로여야 한다 — 검증 전용 클론에서 batchmode로 돌리고 exit code만 본다.
# (스크립트 주석 참고: MCP로 검증하면 컴파일이 깨진 바로 그때 브릿지가 죽어 확인이 불가능해진다.)

VERIFY_LOG=$(mktemp -t autofix-verify)
log "컴파일 확인 ($VERIFY_SCRIPT)"
if ! PROJECT_DIR="$PROJECT_DIR" run_with_timeout 20 "$VERIFY_SCRIPT" > "$VERIFY_LOG" 2>&1; then
  tail -c 2000 "$VERIFY_LOG"
  cat "$VERIFY_LOG" >> "$AGENT_LOG"
  fail "컴파일 검증에 실패했습니다: $(tail -c 300 "$VERIFY_LOG" | tr '\n' ' ')"
fi
cat "$VERIFY_LOG" >> "$AGENT_LOG"
rm -f "$VERIFY_LOG"

# ── PR ────────────────────────────────────────

git config user.name  "bridge-autofix[bot]"
git config user.email "bridge-autofix@users.noreply.github.com"
# 검증에 몇 분이 걸리는 동안 에디터가 또 재직렬화했을 수 있다. add -A 직전에 한 번 더 걷어낸다.
revert_editor_churn
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
