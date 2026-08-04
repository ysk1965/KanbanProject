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
mkdir -p "$LOG_DIR"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

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
  response=$(curl -sS -m 30 -X POST \
    "$BRIDGE_URL/api/v1/jira/autofix/runner/$BRIDGE_BOARD_ID/claim" \
    -H "Authorization: Bearer $BRIDGE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg n "$RUNNER_NAME" --argjson s "$(runner_status_json)" \
          '{runner_name:$n, status:$s}')" 2>&1)
  rc=$?

  if [ $rc -ne 0 ] || ! echo "$response" | jq -e . >/dev/null 2>&1; then
    # BRIDGE가 잠깐 죽어도 러너는 죽지 않는다. 다음 주기에 다시 묻는다.
    [ "$last_reason" != "UNREACHABLE" ] && log "BRIDGE에 닿지 못했다: $(echo "$response" | head -c 200)"
    last_reason="UNREACHABLE"
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
        *)                 log "claim 응답: $reason" ;;
      esac
      last_reason="$reason"
    fi
    sleep "$POLL_SECONDS"
    continue
  fi

  last_reason=""
  issue_key=$(echo "$response" | jq -r '.job.jira_issue_key')
  job_id=$(echo "$response" | jq -r '.job.job_id')
  job_log="$LOG_DIR/${issue_key}-${job_id}.log"

  log "작업 수령: $issue_key (job=$job_id) → $job_log"
  echo "$response" | jq '.job' | "$HERE/autofix-once.sh" "$CONF" 2>&1 | tee "$job_log"
  log "작업 종료: $issue_key"
done
