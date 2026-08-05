#!/usr/bin/env bash
#
# BRIDGE 자동수정 러너 — 폴링 루프.
#
# BRIDGE 큐에 작업이 있으면 가져와(claim) 한 건씩 처리한다. GitHub Actions를 거치지 않는다:
# 실행 주체는 이 맥 한 대뿐이고, 사내망 뒤에 있어 인바운드가 없으며, 언제 여유가 있는지는
# 이 맥만 알기 때문이다.
#
#   ./bridge-autofix-runner.sh [설정파일]     기본값 ~/bridge-autofix/runner.conf
#
# 종료하지 않는다. launchd로 등록해 재부팅 후에도 살아 있게 할 것(com.bridge.autofix.plist).

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${1:-$HOME/bridge-autofix/runner.conf}"

if [ ! -f "$CONF" ]; then
  echo "설정 파일이 없다: $CONF (runner.conf.example를 복사해 채울 것)" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$CONF"; set +a

: "${BRIDGE_URL:?BRIDGE_URL 미설정}"
: "${BRIDGE_BOARD_ID:?BRIDGE_BOARD_ID 미설정}"
: "${BRIDGE_TOKEN:?BRIDGE_TOKEN 미설정}"
: "${PROJECT_DIR:?PROJECT_DIR 미설정}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname -s)}"
POLL_SECONDS="${POLL_SECONDS:-20}"
LOG_DIR="${LOG_DIR:-$HOME/bridge-autofix/logs}"
SPOOL_DIR="${SPOOL_DIR:-$HOME/bridge-autofix/spool}"
mkdir -p "$LOG_DIR" "$SPOOL_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
  LOCK_DIR="${LOCK_DIR:-$PROJECT_DIR/.git/bridge-autofix.lock}"
else
  LOCK_DIR="${LOCK_DIR:-${TMPDIR:-/tmp}/bridge-autofix-$(printf '%s' "$PROJECT_DIR" | shasum | cut -c1-12).lock}"
fi

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# 작업 명세 계약 버전. 서버(AutofixRunnerContract.VERSION)와 같아야 작업을 받는다.
#
# 이 숫자가 있는 이유: 서버가 명세 필드를 바꿔 배포하면 구버전 러너는 값을 "빈 문자열"로 읽는다.
# 그러면 매 건이 실패하는데, 그 실패는 큐를 90분씩 막고 대상을 하나씩 태운다.
# 버전을 실어 보내면 서버가 **작업을 내주기 전에** 거절하므로 아무것도 타지 않고,
# 로그·도크·슬랙에 "러너 스크립트가 낡았다"는 원인이 그대로 뜬다.
#
# 명세 필드를 바꿀 때는 서버 상수와 이 값을 **함께** 올린다.
RUNNER_CONTRACT=3

# ── 유실된 회신 재전송 ──────────────────────────
#
# autofix-once.sh 가 세 번 시도하고도 회신하지 못하면 결과를 스풀에 남긴다. 여기서 계속
# 다시 보낸다 — 회신 한 번을 잃으면 서버는 그 건을 TIMED_OUT으로 회수하고, 그 이슈는 사람이
# 취소하기 전까지 다시 큐에 담기지 않는다(existsActiveForIssue가 종료 상태까지 센다).
#
# 서버는 회수된 뒤 도착한 회신도 받아 결과를 바로잡으므로, 늦은 재전송도 값이 있다.
drain_spool() {
  local file sent=0
  for file in "$SPOOL_DIR"/*.json; do
    [ -e "$file" ] || return 0
    # --fail 필수: 502·401을 받고도 exit 0 이면 스풀 파일을 지워 결과를 영영 잃는다.
    if curl -sS --fail -m 30 -o /dev/null -X POST \
        "$BRIDGE_URL/api/v1/jira/autofix/callback/$BRIDGE_BOARD_ID" \
        -H "Authorization: Bearer $BRIDGE_TOKEN" \
        -H "Content-Type: application/json" \
        --data-binary "@$file"; then
      rm -f "$file"
      sent=$((sent + 1))
    else
      # 아직 서버가 안 돌아왔다. 남겨 두고 다음 주기에 다시 시도한다.
      return 0
    fi
  done
  [ "$sent" -gt 0 ] && log "보관해 둔 회신 ${sent}건을 재전송했다"
  return 0
}

# ── 회신 안전망 ────────────────────────────────
#
# autofix-once.sh 는 EXIT 트랩으로 반드시 회신한다. 하지만 트랩이 돌지 못하는 경우가 있다 —
# SIGKILL, 스크립트를 갈아끼우다 생긴 문법 오류, 인터프리터가 뜨지도 못한 경우.
# 그때 서버는 그 건을 90분 붙들고, 그동안 이 보드의 큐 전체가 멈춘다.
#
# 그래서 자식이 "결과를 살려 뒀다"는 표식(회신 성공 또는 스풀 보관)을 남기지 않고 죽으면
# 루프가 대신 failed를 보낸다. 표식을 보고 판단하는 이유는, 자식이 스풀에 넣어 둔 진짜 결과를
# 여기서 보낸 generic failed 가 밀어내면 안 되기 때문이다(서버는 먼저 도착한 종료 회신만 반영한다).
report_orphan() {
  local job_id="$1" job_key="$2" code="$3"
  local payload
  payload=$(jq -n --arg job "$job_id" --arg key "$job_key" --arg code "$code" \
    '{job_id:$job, job_key:$key, result:"failed", pr_url:"",
      failure_reason:("러너가 회신 없이 종료했습니다 (exit " + $code + "). 맥의 러너 로그를 확인하세요"),
      log_excerpt:""}')

  if curl -sS --fail -m 30 -o /dev/null -X POST \
      "$BRIDGE_URL/api/v1/jira/autofix/callback/$BRIDGE_BOARD_ID" \
      -H "Authorization: Bearer $BRIDGE_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "$payload"; then
    log "자식이 회신하지 못해 루프가 대신 실패를 알렸다 (job=$job_id)"
  else
    log "자식이 회신하지 못했고 루프의 대리 회신도 실패했다 (job=$job_id) — 서버가 회수할 때까지 큐가 막힌다"
  fi
}

# 락을 쥔 실행이 있는지 — 있으면 claim하지 않는다.
#
# claim 해 놓고 락에 막혀 실패하면 그 작업은 FAILED로 확정되고, existsActiveForIssue 때문에
# 그 이슈는 다시 큐에 담기지 않는다. 애초에 가져오지 않는 편이 낫다.
locked_by_other() {
  local holder
  [ -d "$LOCK_DIR" ] || return 1
  holder=$(cat "$LOCK_DIR/pid" 2>/dev/null)
  [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null
}

# 러너 자가진단 — claim에 실어 보낸다.
#
# 러너가 조용한 이유는 대부분 큐가 아니라 이 맥의 환경이다(디스크가 찼다, 에디터 버전이 어긋났다,
# 검증 클론이 없다...). 그걸 서버가 알아야 화면이 "왜 안 도는지"를 말할 수 있고, 그래야 맥에
# SSH로 들어가지 않아도 원인을 안다.
#
# 확인에 실패한 항목은 false가 아니라 **키를 빼서** 보낸다 — 모르는 것을 문제로 표시하면
# 화면이 거짓말을 한다(서버도 null을 "모름"으로 취급한다).
runner_status_json() {
  local disk unity_running version_ok verify_ready gh_ok dirty project_version
  disk=$(df -g "$PROJECT_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
  pgrep -x Unity >/dev/null && unity_running=true || unity_running=false
  gh auth status >/dev/null 2>&1 && gh_ok=true || gh_ok=false
  [ -n "$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null)" ] && dirty=true || dirty=false

  project_version=$(awk '/^m_EditorVersion:/ {print $2}' \
    "$PROJECT_DIR/ProjectSettings/ProjectVersion.txt" 2>/dev/null)
  if [ -n "$project_version" ]; then
    [ -x "/Applications/Unity/Hub/Editor/$project_version/Unity.app/Contents/MacOS/Unity" ] \
      && version_ok=true || version_ok=false
  fi

  # Library까지 있어야 "준비됨"이다. 클론만 있고 임포트가 안 됐으면 첫 검증이 타임아웃으로 죽는다.
  if [ -n "${VERIFY_PROJECT_DIR:-}" ] && [ -d "$VERIFY_PROJECT_DIR/Library" ]; then
    verify_ready=true
  else
    verify_ready=false
  fi

  jq -n \
    --argjson disk "${disk:-null}" \
    --argjson unity "$unity_running" \
    --argjson version "${version_ok:-null}" \
    --argjson verify "$verify_ready" \
    --argjson gh "$gh_ok" \
    --argjson dirty "$dirty" \
    '{disk_free_gb:$disk, unity_running:$unity, unity_version_ok:$version,
      verify_ready:$verify, gh_authenticated:$gh, project_dirty:$dirty}
     | with_entries(select(.value != null))'
}

# 사전 점검은 루프에 들어가기 전에 한 번만 한다 — 매 주기 실패 로그를 쌓아도 고쳐지지 않는다.
for cmd in jq curl gh claude git; do
  command -v "$cmd" >/dev/null || { log "필수 명령이 없다: $cmd"; exit 1; }
done
[ -d "$PROJECT_DIR/.git" ] || { log "PROJECT_DIR이 git 저장소가 아니다: $PROJECT_DIR"; exit 1; }
gh auth status >/dev/null 2>&1 || { log "gh가 인증되지 않았다. gh auth login을 먼저 할 것"; exit 1; }

log "러너 시작 — runner=$RUNNER_NAME board=$BRIDGE_BOARD_ID project=$PROJECT_DIR"

# 같은 이유(빈 큐 등)를 20초마다 찍으면 로그가 쓸모없어진다. 바뀔 때만 남긴다.
last_reason=""

while true; do
  drain_spool

  if locked_by_other; then
    if [ "$last_reason" != "LOCKED" ]; then
      log "다른 실행이 저장소를 쓰고 있다(손으로 돌린 건일 것). 끝날 때까지 claim하지 않는다."
      last_reason="LOCKED"
    fi
    sleep "$POLL_SECONDS"
    continue
  fi

  # HTTP 코드를 본문과 함께 받는다. 코드가 없으면 "토큰이 만료됐다"(401)와 "배포 중이라
  # 잠깐 죽었다"(502)가 로그에서 똑같이 보인다 — 전자는 사람이 손대야 낫고 후자는 1분이면
  # 저절로 낫는데, 구분이 안 되면 고칠 수 있는 고장을 기다리기만 하게 된다.
  raw=$(curl -sS -m 30 -w '\n%{http_code}' -X POST \
    "$BRIDGE_URL/api/v1/jira/autofix/runner/$BRIDGE_BOARD_ID/claim" \
    -H "Authorization: Bearer $BRIDGE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg n "$RUNNER_NAME" --argjson s "$(runner_status_json)" \
          --argjson c "$RUNNER_CONTRACT" \
          '{runner_name:$n, contract_version:$c, status:$s}')" 2>&1)
  rc=$?
  http_code="${raw##*$'\n'}"
  response="${raw%$'\n'*}"
  case "$http_code" in [0-9][0-9][0-9]) ;; *) http_code="000" ;; esac

  if [ $rc -ne 0 ] || [ "$http_code" -ge 400 ] || ! echo "$response" | jq -e . >/dev/null 2>&1; then
    # BRIDGE가 잠깐 죽어도 러너는 죽지 않는다. 다음 주기에 다시 묻는다.
    if [ $rc -ne 0 ]; then
      fail_reason="UNREACHABLE"
    elif [ "$http_code" -ge 400 ]; then
      case "$http_code" in 401|403) fail_reason="AUTH" ;; *) fail_reason="HTTP_$http_code" ;; esac
    else
      fail_reason="BAD_BODY"
    fi

    # 502 본문은 nginx HTML 5줄이다. 그대로 찍으면 한 줄에 한 사건인 로그가 무너진다.
    excerpt=$(printf '%s' "$response" | tr -d '\r' | tr '\n' ' ' | head -c 200)
    if [ "$fail_reason" != "$last_reason" ]; then
      case "$fail_reason" in
        UNREACHABLE) log "BRIDGE에 닿지 못했다: $excerpt" ;;
        AUTH)        log "BRIDGE가 인증을 거부했다(HTTP $http_code). 기다려도 낫지 않는다 — 독에서 러너 토큰을 다시 발급해 BRIDGE_TOKEN을 갱신할 것." ;;
        BAD_BODY)    log "BRIDGE 응답을 JSON으로 읽지 못했다(HTTP $http_code): $excerpt" ;;
        *)           log "BRIDGE 응답이 정상이 아니다(HTTP $http_code): $excerpt" ;;
      esac
      last_reason="$fail_reason"
    fi
    sleep "$POLL_SECONDS"
    continue
  fi

  reason=$(echo "$response" | jq -r '.reason // "UNKNOWN"')

  if [ "$reason" != "CLAIMED" ]; then
    if [ "$reason" != "$last_reason" ]; then
      case "$reason" in
        EMPTY)             log "큐가 비어 있다. 대기." ;;
        DISPATCH_DISABLED) log "BRIDGE에서 자동수정 실행이 꺼져 있다(autofix.dispatch-enabled=false)." ;;
        IN_FLIGHT)         log "서버는 아직 이전 건이 진행 중이라고 본다 — 회신이 유실됐을 수 있다." ;;
        DAILY_LIMIT)       log "오늘 상한에 도달했다. 자정(UTC) 이후 재개된다." ;;
        NO_TARGET)         log "대상 저장소가 없는 작업이 있어 실패 처리됐다." ;;
        CONTRACT_MISMATCH)
          server_contract=$(echo "$response" | jq -r '.contract_version // "?"')
          log "작업 명세 계약이 어긋나 서버가 작업을 내주지 않는다 (서버 v$server_contract / 러너 v$RUNNER_CONTRACT)."
          log "  → 기다려도 낫지 않는다. tools/autofix/runner/ 의 스크립트를 이 맥에 다시 배포할 것:"
          log "     git show origin/develop:tools/autofix/runner/autofix-once.sh > $HERE/autofix-once.sh"
          log "     git show origin/develop:tools/autofix/runner/bridge-autofix-runner.sh > $HERE/bridge-autofix-runner.sh"
          log "     launchctl kickstart -k gui/\$(id -u)/com.bridge.autofix"
          ;;
        *)                 log "claim 응답: $reason" ;;
      esac
      last_reason="$reason"
    fi
    sleep "$POLL_SECONDS"
    continue
  fi

  last_reason=""
  job_key=$(echo "$response" | jq -r '.job.job_key')
  job_id=$(echo "$response" | jq -r '.job.job_id')
  # 로그 파일 이름에 그대로 들어가므로 경로 구분자가 섞이면 엉뚱한 곳에 쓴다.
  safe_key=$(echo "$job_key" | tr -c 'A-Za-z0-9._-' '_')
  job_log="$LOG_DIR/${safe_key}-${job_id}.log"

  log "작업 수령: $job_key (job=$job_id) → $job_log"

  marker="$LOG_DIR/.reported-$job_id"
  rm -f "$marker"
  echo "$response" | jq '.job' \
    | AUTOFIX_REPORT_MARKER="$marker" "$HERE/autofix-once.sh" "$CONF" 2>&1 \
    | tee "$job_log"
  once_rc=${PIPESTATUS[2]}

  if [ ! -e "$marker" ]; then
    report_orphan "$job_id" "$job_key" "$once_rc"
  fi
  rm -f "$marker"

  log "작업 종료: $job_key (exit $once_rc)"
done
