#!/usr/bin/env bash
#
# 컴파일 검증 — 자동수정의 유일한 자동 게이트.
#
#   exit 0 = 컴파일 에러 없음 / exit 1 = 에러를 stdout에 출력
#
# **Editor가 연 프로젝트가 아니라 별도 클론에서 batchmode로 돌린다.** 이유:
#
# 1. 프로젝트 락은 디렉터리 단위다. 클론이 다르면 Editor를 열어둔 채로도 batchmode를 쓸 수 있다.
# 2. Unity MCP로 검증하면 "컴파일이 깨졌는지 확인하는 수단이 컴파일이 깨지면 죽는다" —
#    브릿지 어셈블리가 로드되지 않아 MCP 연결이 끊기기 때문이다. 정확히 실패해야 할 때
#    작동하지 않는 게이트는 게이트가 아니다.
# 3. exit code 하나로 끝나 판정에 LLM이 끼지 않는다.
#
# 작업 트리를 그대로 rsync해 검사한다 — 커밋 전이라 git으로는 가져올 수 없고,
# 에이전트가 실제로 만든 상태를 그대로 보는 편이 정확하다.

set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-$PWD}"
VERIFY_PROJECT_DIR="${VERIFY_PROJECT_DIR:-$HOME/GWBM013-verify}"
VERIFY_TIMEOUT_MINUTES="${VERIFY_TIMEOUT_MINUTES:-12}"

log() { echo "[verify] $*"; }

[ -d "$VERIFY_PROJECT_DIR" ] || { log "검증용 클론이 없다: $VERIFY_PROJECT_DIR"; exit 1; }

# 에디터 버전은 프로젝트가 안다. 하드코딩하면 프로젝트가 업그레이드될 때 조용히 어긋난다.
VERSION_FILE="$PROJECT_DIR/ProjectSettings/ProjectVersion.txt"
[ -f "$VERSION_FILE" ] || { log "ProjectVersion.txt가 없다: $VERSION_FILE"; exit 1; }
UNITY_VERSION=$(awk '/^m_EditorVersion:/ {print $2}' "$VERSION_FILE")
UNITY_BIN="${UNITY_BIN:-/Applications/Unity/Hub/Editor/$UNITY_VERSION/Unity.app/Contents/MacOS/Unity}"
[ -x "$UNITY_BIN" ] || { log "에디터가 없다: $UNITY_BIN (프로젝트 버전 $UNITY_VERSION)"; exit 1; }

# ── 작업 트리 → 검증 클론 ──────────────────────
#
# 컴파일에 관여하는 셋만 옮긴다. Library는 절대 건드리지 않는다 — 그게 warm하게 유지돼야
# 검증이 몇 분 안에 끝난다. --delete는 파일 삭제 수정까지 반영하기 위해 필요하다.

log "작업 트리 동기화 → $VERIFY_PROJECT_DIR"
for d in Assets Packages ProjectSettings; do
  [ -d "$PROJECT_DIR/$d" ] || continue
  rsync -a --delete "$PROJECT_DIR/$d/" "$VERIFY_PROJECT_DIR/$d/" || {
    log "$d 동기화 실패"; exit 1; }
done

# ── batchmode 컴파일 ──────────────────────────

UNITY_LOG=$(mktemp -t autofix-unity)
log "batchmode 컴파일 ($UNITY_VERSION, 최대 ${VERIFY_TIMEOUT_MINUTES}분)"

"$UNITY_BIN" -batchmode -quit -nographics \
  -projectPath "$VERIFY_PROJECT_DIR" \
  -logFile "$UNITY_LOG" &
UNITY_PID=$!

waited=0; limit=$((VERIFY_TIMEOUT_MINUTES * 60))
while kill -0 "$UNITY_PID" 2>/dev/null; do
  sleep 5; waited=$((waited + 5))
  if [ "$waited" -ge "$limit" ]; then
    kill -TERM "$UNITY_PID" 2>/dev/null; sleep 5; kill -KILL "$UNITY_PID" 2>/dev/null
    log "컴파일이 ${VERIFY_TIMEOUT_MINUTES}분 안에 끝나지 않았다"
    tail -c 2000 "$UNITY_LOG"; rm -f "$UNITY_LOG"
    exit 1
  fi
done
wait "$UNITY_PID"; UNITY_RC=$?

# ── 판정 ──────────────────────────────────────
#
# exit code만 믿지 않는다. Unity는 스크립트 컴파일 에러가 있어도 0으로 끝나는 경로가 있다.

ERRORS=$(grep -E "error CS[0-9]+|Scripts have compiler errors" "$UNITY_LOG" | sort -u | head -50)

if [ -n "$ERRORS" ]; then
  log "컴파일 에러:"
  echo "$ERRORS"
  rm -f "$UNITY_LOG"
  exit 1
fi

# 코드가 아닌 파일(로케일 테이블 등)을 고친 실행에서는 error CS 만으로 부족하다 — YAML이
# 깨져도 컴파일 에러는 나오지 않고 임포트만 실패한다. 호출자가 파일 목록을 준 경우에만
# 그 파일들에 대해서 임포트 실패를 추가로 본다. 로그 전체를 훑지 않는 이유는, 이 저장소에
# 이미 존재하는 무관한 임포트 경고까지 게이트로 승격시키면 안 되기 때문이다.
if [ -n "${AUTOFIX_WATCH_ASSETS:-}" ]; then
  while IFS= read -r watched; do
    [ -n "$watched" ] || continue
    HITS=$(grep -F "$(basename "$watched")" "$UNITY_LOG" \
           | grep -iE "error|exception|could not|unable to|failed to" | sort -u | head -10)
    if [ -n "$HITS" ]; then
      log "에셋 임포트 실패: $watched"
      echo "$HITS"
      rm -f "$UNITY_LOG"
      exit 1
    fi
  done <<< "$AUTOFIX_WATCH_ASSETS"
fi

if [ "$UNITY_RC" -ne 0 ]; then
  # 에러 라인은 없는데 비정상 종료 — 라이선스 만료·에디터 크래시 등. 통과시키면 안 된다.
  log "Unity가 비정상 종료했다 (exit $UNITY_RC). 컴파일 에러는 아니지만 검증이 성립하지 않았다."
  tail -c 2000 "$UNITY_LOG"
  rm -f "$UNITY_LOG"
  exit 1
fi

log "컴파일 통과"
rm -f "$UNITY_LOG"
exit 0
