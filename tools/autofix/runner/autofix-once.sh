#!/usr/bin/env bash
#
# 자동수정 1건 처리 — 폴링 루프(bridge-autofix-runner.sh)가 claim한 작업 명세를 stdin으로 받는다.
#
#   echo "$JOB_JSON" | ./autofix-once.sh [설정파일]
#
# 손으로 한 건만 돌려보려면 (BRIDGE에 회신하지 않는다):
#   NO_REPORT=1 ./autofix-once.sh ~/bridge-autofix/runner.conf <<'EOF'
#   {"job_id":"","job_key":"QASA-40","job_kind":"JIRA","title":"...",
#    "instruction":"고쳐야 할 내용 전문","repo_full_name":"org/repo",
#    "base_ref":"develop","branch":"autofix/QASA-40","timeout_minutes":60}
#   EOF
#
# 러너는 작업의 출처(JIRA 이슈 / 사람이 맡긴 태스크 / 체크리스트 항목)를 모른다. 무엇을 고칠지는
# `instruction` 한 덩어리로 오고, 맥락과 범위 제한을 문장으로 만드는 것은 전부 서버의 일이다.
# 여기에 출처별 분기가 생기면 프롬프트를 고칠 때마다 맥에 재배포해야 한다.
#
# 어떤 경로로 끝나든 BRIDGE에 결과를 회신한다(EXIT 트랩). 회신이 없으면 그 한 건이 서버의
# 회수 시각까지 보드의 큐 전체를 막는다. 그래서 트랩은 **가능한 한 앞에서** 설치하고,
# 명세 검증을 포함한 모든 실패 판정은 그 뒤에 둔다 — 트랩 앞의 코드는 저 약속 밖이다.
# 폴링 루프도 이 스크립트가 회신 없이 죽는 경우(문법 오류·SIGKILL)를 대비해 한 번 더 받쳐준다.

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
JOB_KEY=$(field job_key)
JOB_TITLE=$(field title)
INSTRUCTION=$(field instruction)
REPO_FULL_NAME=$(field repo_full_name)
BASE_REF=$(field base_ref)
BRANCH=$(field branch)
TIMEOUT_MINUTES=$(echo "$JOB" | jq -r '.timeout_minutes // 60')

# 명세 검증은 회신 트랩을 설치한 **뒤에** 한다(아래 "작업 명세 검증" 절). 기본값만 여기서 채운다.
[ -n "$BRANCH" ] || BRANCH="autofix/${JOB_KEY:-unknown}"
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

# 스크린샷·영상을 내려받아 둘 곳. 에이전트는 로컬 경로로만 파일을 읽을 수 있다.
MATERIALS_DIR=$(mktemp -d -t autofix-materials)
MATERIALS_NOTE=""

# 상한 — 자료가 많은 이슈에서 다운로드와 프롬프트가 같이 부푸는 것을 막는다.
MAX_IMAGES="${MAX_IMAGES:-8}"
MAX_MATERIAL_MB="${MAX_MATERIAL_MB:-8}"
VIDEO_FRAMES="${VIDEO_FRAMES:-4}"

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
    --arg job "$JOB_ID" --arg key "$JOB_KEY" --arg result "$RESULT" \
    --arg pr "$PR_URL" --arg reason "$FAILURE_REASON" --arg log "$excerpt" \
    '{job_id:$job, job_key:$key, result:$result, pr_url:$pr,
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
# 결과가 어떤 형태로든 살아남았음을 폴링 루프에 알리는 표식(회신 성공 또는 스풀 보관).
# 이게 없으면 루프가 대신 failed를 보낸다 — 이 함수 자체가 실행되지 못한 경우(SIGKILL,
# 문법 오류)를 덮기 위한 것이라 성공 경로에서도 반드시 남겨야 한다.
mark_reported() {
  [ -n "${AUTOFIX_REPORT_MARKER:-}" ] && : > "$AUTOFIX_REPORT_MARKER" 2>/dev/null
  return 0
}

report() {
  [ "$NO_REPORT" = "1" ] && { log "NO_REPORT=1 — 회신 생략 (result=$RESULT)"; mark_reported; return; }
  [ -n "${BRIDGE_URL:-}" ] && [ -n "${BRIDGE_BOARD_ID:-}" ] && [ -n "${BRIDGE_TOKEN:-}" ] || {
    log "BRIDGE 설정이 없어 회신하지 못한다 (result=$RESULT)"; return; }

  local payload
  payload=$(callback_payload)

  local delay
  for delay in 0 5 15; do
    [ "$delay" -gt 0 ] && sleep "$delay"
    if post_callback "$payload"; then
      [ "$delay" -gt 0 ] && log "회신 성공 (재시도 후)"
      mark_reported
      return 0
    fi
    log "회신 실패 — 재시도"
  done

  # 여기까지 왔으면 BRIDGE가 죽었거나 네트워크가 끊긴 것이다. 결과를 버리지 않고 남긴다.
  mkdir -p "$SPOOL_DIR" 2>/dev/null
  # 키가 비어 있을 수 있다(명세를 못 읽은 실패도 여기로 온다). 파일명에 그대로 넣지 않는다.
  local safe_key
  safe_key=$(printf '%s' "${JOB_KEY:-unknown}" | tr -c 'A-Za-z0-9._-' '_')
  local spooled="$SPOOL_DIR/$(date -u +%Y%m%dT%H%M%S)-${safe_key}.json"
  if printf '%s' "$payload" > "$spooled" 2>/dev/null; then
    log "회신 실패 — 스풀에 보관했다: $spooled (폴링 루프가 재전송한다)"
    # 결과는 살아 있다. 루프가 덮어쓰는 generic failed를 보내면 이 결과가 밀려나므로 표식을 남긴다.
    mark_reported
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

  rm -rf "$MATERIALS_DIR" 2>/dev/null

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

# ── 작업 명세 검증 ──────────────────────────────
#
# 이 검증이 트랩 **뒤에** 있는 것이 중요하다. 앞에 두고 `exit 1` 하면 회신이 나가지 않고,
# 그러면 서버는 이 건을 90분(dispatch-timeout) 동안 DISPATCHED로 붙들고 있으며 그동안
# 보드의 큐 전체가 IN_FLIGHT로 막힌다. 회수된 뒤에는 그 대상이 다시 큐에 담기지도 않는다.
#
# 실제로 2026-08-05에 그렇게 멈췄다. 서버가 jira_issue_key → job_key 로 리네임된 버전으로
# 배포됐는데 맥의 스크립트가 구버전이라 키를 못 읽었고, 검증이 트랩 앞에 있어 아무 신호도
# 남기지 못한 채 큐가 한 시간 넘게 정지했다. 명세를 못 읽는 것은 정상적인 실패 경로다 —
# 조용히 죽는 경로가 아니라 **failed로 회신하는 경로**여야 한다.
[ -n "$JOB_KEY" ] || fail "작업 명세에 job_key가 없습니다 — 서버 계약이 러너보다 새 버전입니다. tools/autofix/runner/ 를 갱신하세요"
[ -n "$INSTRUCTION" ] || fail "작업 명세에 instruction이 없습니다 — 서버 계약이 러너보다 새 버전입니다. tools/autofix/runner/ 를 갱신하세요"

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

# ── 자료(스크린샷·영상) 내려받기 ────────────────
#
# QA 이슈는 글보다 그림이 정확하다. "토큰값이 노출됨" 같은 본문은 어느 화면 어느 위치인지
# 말해주지 않지만 스크린샷 한 장은 말해준다.
#
# URL은 BRIDGE가 S3에 올려 둔 공개 주소다(지라 첨부를 import 시점에 이미 받아 뒀다).
# 지라 자격증명이 맥까지 내려오지 않는다 — 러너가 들고 있는 비밀은 콜백 토큰 하나뿐이다.
#
# 실패는 전부 무시하고 넘어간다. 자료를 못 받은 것이 작업을 세울 이유는 못 된다.
safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-60
}

# --fail 없이 -o 를 쓰면 curl은 404를 받고도 exit 0 이고, 에러 페이지 HTML이 파일로 남는다.
# 그걸 "스크린샷"이라며 넘기면 에이전트는 그림 대신 HTML을 읽고 한 턴을 버린다.
# 내려받은 뒤 실제 형식도 확인한다 — 200으로 온 에러 페이지까지 걸러야 한다.
fetch_image() {
  local url="$1" target="$2" limit="$3" timeout="$4" kind
  curl -sS --fail -L --max-filesize "$limit" -m "$timeout" -o "$target" "$url" 2>/dev/null || {
    rm -f "$target"; return 1; }

  kind=$(file -b --mime-type "$target" 2>/dev/null)
  case "$kind" in
    image/*|video/*) return 0 ;;
    *) log "받은 파일이 이미지·영상이 아니다($kind) — 버린다"; rm -f "$target"; return 1 ;;
  esac
}

# 영상은 Claude가 볼 수 없다. 프레임을 뽑아 이미지로 바꿔 준다 —
# 재현 영상은 "언제 깨지는가"를 담고 있어서 버리기 아깝다.
extract_frames() {
  local video="$1" stem="$2" duration interval
  command -v ffmpeg >/dev/null || { log "ffmpeg가 없어 영상 프레임을 뽑지 못했다: $stem"; return 1; }

  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video" 2>/dev/null | cut -d. -f1)
  case "$duration" in ''|*[!0-9]*) duration=20 ;; esac
  [ "$duration" -lt 1 ] && duration=1

  # 균등 간격으로 VIDEO_FRAMES장. 짧은 영상이면 간격이 1초 아래로 내려가지 않게 막는다.
  interval=$((duration / VIDEO_FRAMES))
  [ "$interval" -lt 1 ] && interval=1

  ffmpeg -nostdin -loglevel error -y -i "$video" \
    -vf "fps=1/$interval" -frames:v "$VIDEO_FRAMES" \
    "$MATERIALS_DIR/${stem}_frame%02d.png" 2>/dev/null || return 1

  local n
  n=$(find "$MATERIALS_DIR" -name "${stem}_frame*.png" | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] || return 1
  echo "$n"
}

fetch_materials() {
  local count total image_count
  count=$(echo "$JOB" | jq '(.materials // []) | length')
  [ "$count" -gt 0 ] 2>/dev/null || return 0

  # ${count}건 — 중괄호를 빼면 UTF-8 로케일의 bash가 뒤따르는 한글을 변수명으로 삼아
  # set -u 아래에서 죽는다. launchd(C 로케일)에서는 우연히 통과해 더 늦게 발견된다.
  log "자료 ${count}건 확인 — 내려받는다 (이미지 최대 ${MAX_IMAGES}장, 건당 ${MAX_MATERIAL_MB}MB)"
  total=$((MAX_MATERIAL_MB * 1024 * 1024))
  image_count=0

  local i filename mime url stem target frames fr
  for i in $(seq 0 $((count - 1))); do
    filename=$(echo "$JOB" | jq -r ".materials[$i].filename // \"\"")
    mime=$(echo "$JOB" | jq -r ".materials[$i].mime_type // \"\"")
    url=$(echo "$JOB" | jq -r ".materials[$i].url // \"\"")
    [ -n "$url" ] || continue

    if [ "$image_count" -ge "$MAX_IMAGES" ]; then
      MATERIALS_NOTE="${MATERIALS_NOTE}- (상한 초과로 생략) $filename"$'\n'
      continue
    fi

    stem="$(printf '%02d' "$i")_$(safe_name "$filename")"

    case "$mime" in
      image/*)
        target="$MATERIALS_DIR/$stem"
        if fetch_image "$url" "$target" "$total" 60; then
          MATERIALS_NOTE="${MATERIALS_NOTE}- 스크린샷 \`$target\` (원본: $filename)"$'\n'
          image_count=$((image_count + 1))
        else
          log "자료 내려받기 실패(무시): $filename"
        fi
        ;;
      video/*)
        target="$MATERIALS_DIR/raw_$stem"
        if fetch_image "$url" "$target" "$total" 120; then
          if frames=$(extract_frames "$target" "$stem"); then
            # glob이 아니라 실제 경로를 하나씩 준다 — 에이전트는 Read에 정확한 경로가 필요하다.
            MATERIALS_NOTE="${MATERIALS_NOTE}- 영상 $filename → 프레임 ${frames}장 (시간 순):"$'\n'
            for fr in "$MATERIALS_DIR/${stem}"_frame*.png; do
              [ -e "$fr" ] || continue
              MATERIALS_NOTE="${MATERIALS_NOTE}    \`$fr\`"$'\n'
            done
            image_count=$((image_count + 1))
          else
            MATERIALS_NOTE="${MATERIALS_NOTE}- 영상 $filename (프레임 추출 실패 — 사람이 봐야 한다)"$'\n'
          fi
          rm -f "$target"
        else
          log "영상 내려받기 실패(무시): $filename"
        fi
        ;;
      *)
        MATERIALS_NOTE="${MATERIALS_NOTE}- 첨부 $filename ($mime — 열어보지 않았다)"$'\n'
        ;;
    esac
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

log "=== $JOB_KEY / $REPO_FULL_NAME / $BASE_REF → $BRANCH (상한 ${TIMEOUT_MINUTES}분) ==="

# ── 브랜치 ────────────────────────────────────

git fetch origin "$BASE_REF" --quiet || fail "origin/$BASE_REF 를 가져오지 못했습니다"
git checkout -B "$BRANCH" "origin/$BASE_REF" --quiet || fail "브랜치 $BRANCH 를 만들지 못했습니다"

# ── 수정 시도 ──────────────────────────────────
#
# 로컬라이즈 절차를 굳이 적어두는 이유: QASA-133에서 에이전트가 알아서 옳게 했지만, 지시가
# 없었으므로 재현이 보장되지 않는다. 그 건은 기능이 "행성정화"인데 기획이 만들어 둔 토큰은
# IDLE_LEVEL_POP_* 계열이었다 — 키 이름으로 찾았다면 못 찾고 새 키를 지어냈을 것이고,
# 테이블은 수정 금지라 그 수정은 PR에 실리지도 않은 채 빈 PR이 열렸을 것이다.
#
# 절차를 키→ID→값 순서로 못박은 것도 이유가 있다. 로케일 파일은 번역값을 \uXXXX로 저장해서
# 한글 문구를 그대로 grep하면 0건이 나온다("행성정화 등급 상승"으로 찾으면 정말 0건이다).
# 에이전트에게는 Bash가 없어 변환 도구를 쓸 수도 없다. ASCII인 키와 ID를 징검다리로 삼는
# 이 경로만 Read·Grep으로 끝까지 간다.

fetch_materials

# 제약은 여기 하드코딩으로 남긴다. 서버가 프롬프트 본문을 쥐면 표현을 고칠 때마다 맥에
# 재배포하지 않아도 되지만, 안전장치까지 서버가 쥐면 임의 문자열 하나로 가드레일을 지울 수 있다.
# 수동 위임은 사람이 쓴 지시문이 그대로 내려오므로 이 구분이 특히 중요하다.
PROMPT_FILE=$(mktemp -t autofix-prompt)
{
  cat <<'PROMPT'
아래 작업을 이 Unity 저장소에서 수행하라.

제약(반드시 지킨다):
- 지시와 직접 관련된 최소 변경만 한다. 리팩터링·정리·포맷팅 금지
- 기대 동작이 지시에서 확정되지 않으면 아무것도 고치지 말고 그 이유를 말하고 끝낸다
- 에셋 바이너리(.unity, .prefab, .asset)는 건드리지 않는다. 코드만 수정한다
- .github/ 아래 파일은 어떤 이유로도 수정하지 않는다
- Unity MCP로 콘솔 에러와 관련 스크립트를 먼저 확인한 뒤 수정한다

로컬라이즈 토큰이 날것으로 노출되는 증상이면(키 문자열이 화면에 그대로 보인다), 코드가 쓰는 키가
테이블에 없는 것이다. 이미 등록된 올바른 키를 찾아 코드를 그쪽으로 돌린다. 절차:

1. 화면에 나와야 할 문구를 코드의 필드명·주석에서 확인한다
2. 키 이름을 추측해 찾지 마라. 기능명과 토큰 접두사가 다른 경우가 흔하다(기획 초기 명칭이 남아 있다).
   대신 같은 화면·기능의 다른 코드가 실제로 넘기는 토큰을 grep해 그 접두사 계열을 알아낸다
3. 공용 데이터(Shared Data)에서 그 계열의 키와 m_Id를 모은다
4. 로케일 파일에서 각 m_Id의 m_Localized를 읽어 1의 문구와 대조한다
5. 맞는 키를 찾으면 근거를 하나 더 확보한다: 같은 계열의 제목 키가 그 화면 제목인지, ID가 연속된
   한 블록인지(기획이 그 화면용으로 한 번에 만든 묶음이라는 뜻), 같은 화면이 그 접두사를 쓰는지
6. 문구가 테이블에 없으면 키를 새로 만들지 말고, 없다는 사실과 필요한 문구를 보고하고 끝낸다

주의: 로케일 파일의 번역값은 \uXXXX 로 이스케이프돼 저장된다. 한글을 그대로 grep하면 0건이 나오므로
문구로 직접 검색하려 하지 마라. 키와 m_Id는 ASCII라 grep이 듣는다 — 위 3→4 순서가 유일하게 통하는
경로다. m_Localized 값은 읽어서 직접 디코드해 판단한다.
PROMPT
  echo ""
  echo "작업 $JOB_KEY: $JOB_TITLE"
  echo ""
  # 본문은 서버가 조립해 보낸다(JIRA 이슈 / 사람이 쓴 지시문 + 검증 수단 + 테스트 인프라).
  # 러너가 다시 조립하지 않는 이유: MANUAL 작업은 이슈 본문 자체가 없어 분기가 양쪽에 생긴다.
  echo "$INSTRUCTION"

  # 댓글 — 재현 절차와 추가 조건이 본문이 아니라 여기 이어지는 경우가 많다.
  if [ "$(echo "$JOB" | jq '(.comments // []) | length')" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "--- 댓글 (오래된 순) ---"
    echo "$JOB" | jq -r '(.comments // [])[] | "[\(.created_at // "" | .[0:16])] \(.author // "?"): \(.body // "")"'
  fi

  # 첨부는 러너만 안다 — 내려받은 로컬 경로라 서버가 조립할 수 없다.
  if [ -n "$MATERIALS_NOTE" ]; then
    echo ""
    echo "--- 첨부 자료 ---"
    printf '%s' "$MATERIALS_NOTE"
    echo ""
    echo "위 이미지 파일을 Read로 먼저 열어 증상을 눈으로 확인한 뒤 코드를 보라. 어느 화면 어느"
    echo "위치인지는 글보다 그림이 정확하다. 영상 프레임은 시간 순서이므로 언제 증상이 나타나는지"
    echo "판단하는 데 쓴다. 이미지에서 읽은 근거는 무엇을 보고 그렇게 판단했는지 함께 보고하라."
    echo "열어보지 못한 첨부가 있으면 그 사실을 보고에 남긴다 — 사람이 그 부분을 확인해야 한다."
  fi
} > "$PROMPT_FILE"

log "에이전트 실행"
# --add-dir: 자료는 작업 트리 밖(임시 폴더)에 있다. 안에 두면 git status가 더러워져 사전 점검이
# 막히고 git add -A가 스크린샷을 PR에 담는다. 대신 그 폴더만 명시적으로 열어 준다.
run_with_timeout "$TIMEOUT_MINUTES" \
  claude -p "$(cat "$PROMPT_FILE")" \
    --allowedTools "Read,Grep,Glob,Edit,mcp__unity" \
    --add-dir "$MATERIALS_DIR" \
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

# 워크플로 파일 변경은 프롬프트로만 막지 않는다 — 실제 diff를 본다.
# PR을 여는 것만으로 실행되는 경로가 있어, 여기서 새면 "머지 전 사람이 리뷰한다"는
# 이 파이프라인의 마지막 전제가 통째로 무너진다.
if git status --porcelain | awk '{print $NF}' | grep -q '^\.github/'; then
  git status --porcelain | grep '\.github/'
  fail "워크플로 파일(.github/)을 변경했습니다. 자동수정은 이 경로를 건드리지 않습니다"
fi

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
git commit -q -m "fix($JOB_KEY): $JOB_TITLE" || fail "커밋에 실패했습니다"
git push -u origin "$BRANCH" --quiet || fail "브랜치 push에 실패했습니다"

PR_BODY=$(cat <<EOF
BRIDGE 자동수정이 생성한 PR입니다. **머지 전 반드시 사람이 검토하세요.**

- 작업: $JOB_KEY
- 자동 검증 범위: 컴파일 통과까지만. 동작은 확인되지 않았습니다.
- 러너: $RUNNER_NAME

<details><summary>지시문</summary>

\`\`\`
$INSTRUCTION
\`\`\`

</details>

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
  --title "[$JOB_KEY] $JOB_TITLE" \
  --body "$PR_BODY" 2>&1) || fail "PR 생성에 실패했습니다: $(echo "$PR_URL" | tail -c 300)"

log "PR: $PR_URL"
RESULT="pr"
exit 0
