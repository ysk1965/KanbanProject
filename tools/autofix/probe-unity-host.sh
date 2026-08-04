#!/usr/bin/env bash
# 자동수정 파이프라인 대상 맥 환경 조사.
#
# 읽기만 한다 — 아무것도 설치·수정·삭제하지 않는다.
# 출력을 그대로 복사해 돌려주면 계획서의 추정치를 실측치로 교체할 수 있다.
#
# 사용법:
#   ./probe-unity-host.sh /path/to/UnityProject
#   ./probe-unity-host.sh                        # 프로젝트 경로 자동 탐색

set -uo pipefail

PROJECT="${1:-}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$*"; }

printf '\033[1m자동수정 대상 맥 환경 조사\033[0m — %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"

# ── 1. 머신 ──────────────────────────────────────
head_ "1. 머신"
info "$(sw_vers -productName) $(sw_vers -productVersion) ($(uname -m))"
info "호스트: $(scutil --get LocalHostName 2>/dev/null || hostname)"
info "CPU 코어: $(sysctl -n hw.ncpu)  /  메모리: $(( $(sysctl -n hw.memsize) / 1073741824 ))GB"

DISK_FREE=$(df -g / | awk 'NR==2 {print $4}')
if [ "$DISK_FREE" -lt 50 ]; then
  warn "디스크 여유 ${DISK_FREE}GB — Library 재빌드가 반복되므로 50GB 이상 권장"
else
  ok "디스크 여유 ${DISK_FREE}GB"
fi

# 슬립하면 파이프라인이 멈춘다
# $1 완전일치로 잡는다 — 부분매치하면 hibernatefile(/var/vm/sleepimage) 값을 물어온다
SLEEP_VAL=$(pmset -g 2>/dev/null | awk '$1=="sleep" {print $2; exit}')
if [ "${SLEEP_VAL:-1}" = "0" ]; then
  ok "시스템 슬립 비활성 (상시 기동 가능)"
else
  warn "시스템 슬립 ${SLEEP_VAL:-?}분 — 배치 중 멈춘다. caffeinate 또는 pmset 조정 필요"
fi

# ── 2. Unity ─────────────────────────────────────
head_ "2. Unity"
HUB_DIR="/Applications/Unity/Hub/Editor"
if [ -d "$HUB_DIR" ]; then
  EDITORS=$(ls "$HUB_DIR" 2>/dev/null)
  if [ -n "$EDITORS" ]; then
    ok "설치된 에디터:"
    while IFS= read -r v; do info "- $v"; done <<< "$EDITORS"
  else
    no "Unity Hub는 있으나 설치된 에디터가 없다"
  fi
else
  no "Unity Hub 에디터 디렉터리 없음 ($HUB_DIR)"
fi

if pgrep -x "Unity" >/dev/null 2>&1; then
  ok "Unity Editor 실행 중 (Unity MCP는 에디터가 떠 있어야 동작)"
else
  warn "Unity Editor 미실행 — MCP를 쓰려면 상시 기동이 필요"
fi

ULF_DIR="/Library/Application Support/Unity"
if ls "$ULF_DIR"/*.ulf >/dev/null 2>&1 || [ -d "$HOME/Library/Application Support/Unity/licenses" ]; then
  ok "라이선스 파일 흔적 있음 (활성화 여부는 에디터에서 확인 필요)"
else
  warn "라이선스 파일을 못 찾음 — 배치모드 실행 전 활성화 확인 필요"
fi

# ── 3. 프로젝트 ──────────────────────────────────
head_ "3. Unity 프로젝트"
if [ -z "$PROJECT" ]; then
  PROJECT=$(find "$HOME" -maxdepth 5 -type d -name ProjectSettings 2>/dev/null \
            | head -1 | xargs -I{} dirname {} 2>/dev/null)
fi

if [ -z "$PROJECT" ] || [ ! -d "$PROJECT" ]; then
  no "프로젝트를 찾지 못했다. 경로를 인자로 넘겨라: ./probe-unity-host.sh /path/to/Project"
else
  ok "경로: $PROJECT"

  PV="$PROJECT/ProjectSettings/ProjectVersion.txt"
  if [ -f "$PV" ]; then
    PROJ_VER=$(awk '/m_EditorVersion:/ {print $2; exit}' "$PV")
    info "프로젝트 Unity 버전: $PROJ_VER"
    if [ -d "$HUB_DIR/$PROJ_VER" ]; then
      ok "해당 버전 에디터 설치됨"
    else
      no "해당 버전 에디터가 없다 — Hub에서 $PROJ_VER 설치 필요"
    fi
  fi

  # 재임포트 비용의 대리 지표. 이 두 값이 처리량을 지배한다.
  if [ -d "$PROJECT/Library" ]; then
    info "Library 크기: $(du -sh "$PROJECT/Library" 2>/dev/null | cut -f1)  ← 브랜치 전환 시 재빌드 대상"
  else
    warn "Library 없음 — 최초 임포트가 아직 안 된 상태(첫 실행이 매우 오래 걸린다)"
  fi
  if [ -d "$PROJECT/Assets" ]; then
    info "Assets 파일 수: $(find "$PROJECT/Assets" -type f 2>/dev/null | wc -l | tr -d ' ')"
  fi

  # 자동 검증 수단이 이미 있는지 — 트리아지 후보의 실효성을 좌우한다
  TEST_ASMDEF=$(find "$PROJECT/Assets" -name '*.asmdef' 2>/dev/null \
                | xargs grep -l 'UnityEngine.TestRunner\|nunit.framework' 2>/dev/null | wc -l | tr -d ' ')
  if [ "${TEST_ASMDEF:-0}" -gt 0 ]; then
    ok "테스트 어셈블리 ${TEST_ASMDEF}개 — EditMode/PlayMode 테스트 기반이 있다"
  else
    warn "테스트 어셈블리를 못 찾음 — 자동 검증 수단이 없으면 후보가 0에 수렴한다"
  fi

  # git
  if git -C "$PROJECT" rev-parse --git-dir >/dev/null 2>&1; then
    ok "git 저장소"
    info "브랜치: $(git -C "$PROJECT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    info "원격: $(git -C "$PROJECT" remote get-url origin 2>/dev/null || echo '(없음)')"
    DIRTY=$(git -C "$PROJECT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DIRTY" -gt 0 ]; then
      warn "작업 트리에 미커밋 변경 ${DIRTY}건 — 자동수정 전에 정리되어야 한다"
    else
      ok "작업 트리 깨끗함"
    fi
    if [ -f "$PROJECT/.gitattributes" ] && grep -q 'lfs' "$PROJECT/.gitattributes" 2>/dev/null; then
      info "Git LFS 사용 중 (러너에 git-lfs 필요)"
    fi
  else
    no "git 저장소가 아니다 — PR을 만들 수 없다"
  fi
fi

# ── 4. 파이프라인 도구 ────────────────────────────
head_ "4. 파이프라인 도구"
check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1 — $($2 2>&1 | head -1)"
  else
    no "$1 없음 — $3"
  fi
}
check_cmd git   "git --version"          "Xcode CLT 설치 필요"
check_cmd gh    "gh --version"           "PR 생성용. brew install gh"
check_cmd node  "node --version"         "Claude Code 실행에 필요"
check_cmd claude "claude --version"      "코딩 에이전트 본체"
check_cmd jq    "jq --version"           "러너 JSON 처리에 사용"
check_cmd curl  "curl --version"         "BRIDGE와 통신"

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    ok "gh 인증됨"
  else
    warn "gh 미인증 — gh auth login 필요"
  fi
fi

if [ -f "$HOME/bridge-autofix/runner.conf" ]; then
  ok "러너 설정 있음 (~/bridge-autofix/runner.conf)"
  if pgrep -f "bridge-autofix-runner.sh" >/dev/null 2>&1; then
    ok "러너 프로세스 실행 중"
  else
    warn "러너가 설정돼 있으나 실행 중이 아니다 — launchctl list | grep bridge.autofix"
  fi
else
  no "러너 미설치 — README 3번(러너 설치) 참고"
fi

# MCP 설정 확인 (Claude Code 사용자 설정)
if [ -f "$HOME/.claude.json" ]; then
  if grep -q '"mcpServers": *{ *"' "$HOME/.claude.json" 2>/dev/null; then
    ok "Claude Code에 MCP 서버가 설정돼 있다"
  else
    warn "Claude Code MCP 서버 미설정 — Unity MCP 연결 필요"
  fi
else
  warn "~/.claude.json 없음 — Claude Code를 아직 안 썼거나 미설치"
fi

# ── 5. 재임포트 실측 안내 ─────────────────────────
head_ "5. 다음 측정 (수동)"
cat <<'EOF'
    처리량을 지배하는 값이라 반드시 실측이 필요하다. 에디터를 닫고:

      cd <프로젝트>
      git checkout -b probe/reimport-test
      time /Applications/Unity/Hub/Editor/<버전>/Unity.app/Contents/MacOS/Unity \
        -batchmode -quit -projectPath "$PWD" -logFile /tmp/unity-reimport.log

    2회 실행해 (1) 콜드 (2) 웜 시간을 잰다. 이 두 숫자로 이슈 1건당 소요와
    하루 처리 상한이 정해진다.
EOF

printf '\n\033[1m조사 끝 — 위 출력을 그대로 복사해 전달\033[0m\n'
