#!/usr/bin/env bash
#
# EB prebuild hook — 스토리지 문서(docx/pptx/hwp) PDF 미리보기(DocumentPreviewService)용 LibreOffice 설치.
#
# Amazon Linux 2023 저장소에는 LibreOffice 가 없어서 TDF 공식 RPM 번들을 내려받아 설치하고
# /usr/bin/soffice 로 심볼릭 링크를 건다(SOFFICE_PATH 기본값과 일치).
# 한글 문서 렌더용 CJK 폰트와, HWP 5.0/HWPX 를 읽게 해주는 H2Orestart 확장도 같이 넣는다
# (LibreOffice 기본 hwp 필터는 HWP 3.x "Hangul WP 97" 만 지원).
#
# 설계 원칙 (01_install_ffmpeg.sh 와 동일):
#   - 멱등: 이미 동작하는 soffice 가 있으면 건너뛴다.
#   - best-effort: 어느 단계가 실패해도 exit 0. 앱은 soffice 부재를 감지해 UNAVAILABLE 로 응답한다.
#
set -uo pipefail

LO_VERSION="${LIBREOFFICE_VERSION:-26.2.6}"
TARGET=/usr/bin/soffice
LOG_PREFIX="[libreoffice-hook]"
H2O_URL="https://github.com/ebandal/H2Orestart/releases/latest/download/H2Orestart.oxt"

log() { echo "${LOG_PREFIX} $*"; }

install_h2orestart() {
  # 확장은 shared 로 넣어야 앱 프로세스(webapp 유저)의 임시 프로필에서도 보인다
  local unopkg
  unopkg="$(dirname "$(readlink -f "$TARGET")")/unopkg"
  if [ ! -x "$unopkg" ]; then log "unopkg not found — skip H2Orestart (hwp 5.0 unsupported)"; return; fi
  if "$unopkg" list --shared 2>/dev/null | grep -qi h2orestart; then
    log "H2Orestart already installed"; return
  fi
  local tmp; tmp="$(mktemp -d)"
  if curl -fsSL --retry 3 --retry-delay 2 --max-time 120 -o "$tmp/H2Orestart.oxt" "$H2O_URL"; then
    if "$unopkg" add --shared --suppress-license "$tmp/H2Orestart.oxt" >/dev/null 2>&1; then
      log "H2Orestart installed (hwp/hwpx import enabled)"
    else
      log "H2Orestart install failed — hwp 5.0 conversion will fail, docx/pptx unaffected"
    fi
  else
    log "H2Orestart download failed — skip"
  fi
  rm -rf "$tmp"
}

install_fonts() {
  # 한글이 네모(tofu)로 찍히지 않게 CJK 폰트. 패키지명이 AL 버전마다 달라 후보를 순서대로 시도.
  if fc-list 2>/dev/null | grep -qiE 'CJK|Nanum'; then log "CJK font present"; return; fi
  for pkg in google-noto-sans-cjk-vf-fonts google-noto-sans-cjk-fonts google-noto-sans-cjk-ttc-fonts; do
    if dnf install -y -q "$pkg" >/dev/null 2>&1; then log "font installed: $pkg"; return; fi
  done
  log "CJK font install failed — Korean text may render as boxes"
}

# 1) 이미 설치돼 있으면 확장/폰트만 확인하고 종료
if [ -x "$TARGET" ] && "$TARGET" --version >/dev/null 2>&1; then
  log "already installed: $("$TARGET" --version 2>/dev/null | head -1)"
  install_fonts
  install_h2orestart
  exit 0
fi

# 2) TDF 는 x86_64 RPM 만 제공한다
if [ "$(uname -m)" != "x86_64" ]; then
  log "unsupported arch $(uname -m) — skip (document preview unavailable)"
  exit 0
fi

# 2.5) 인플레이스 배포(앱이 이미 실행 중)에서는 설치하지 않는다.
# t3.small(2GB)에서 Java 앱과 dnf/rpm 이 메모리를 경합하면 인스턴스가 마비되어
# EB 배포 명령이 타임아웃된다 (2026-09-07 dev 배포 중단 사고). 신규 인스턴스
# 프로비저닝 시에만 설치하고, 기존 인스턴스는 야간 재생성 때 자연히 설치된다.
if pgrep -f 'java .*\.jar' >/dev/null 2>&1; then
  log "app already running — skip install on in-place deploy (installed on fresh instances only)"
  exit 0
fi

# 3) 런타임 의존성 (헤드리스여도 X 라이브러리 일부를 링크한다). 실패해도 계속.
dnf install -y -q libXinerama libXrandr libXrender libSM libICE libX11 libXext \
  cairo cups-libs dbus-libs mesa-libGL fontconfig freetype >/dev/null 2>&1 \
  || log "some runtime deps failed to install — continuing"

# 4) 다운로드
URL="https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/rpm/x86_64/LibreOffice_${LO_VERSION}_Linux_x86-64_rpm.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log "downloading $URL"
if ! curl -fsSL --retry 3 --retry-delay 3 --max-time 600 -o "$TMP/lo.tar.gz" "$URL"; then
  log "download failed — skip (document preview unavailable)"
  exit 0
fi
if ! tar -xzf "$TMP/lo.tar.gz" -C "$TMP"; then
  log "extract failed — skip"
  exit 0
fi

# 5) 설치 (데스크톱 통합 패키지는 제외)
RPMS_DIR="$(find "$TMP" -maxdepth 2 -type d -name RPMS | head -1)"
if [ -z "$RPMS_DIR" ]; then log "unexpected archive layout — skip"; exit 0; fi
if ! rpm -Uvh --quiet --nodeps "$RPMS_DIR"/*.rpm >/dev/null 2>&1; then
  # 일부 RPM 이 이미 있거나 충돌해도 실행 파일만 있으면 된다
  log "rpm install reported errors — checking binary anyway"
fi

BIN="$(ls -d /opt/libreoffice*/program/soffice 2>/dev/null | sort -V | tail -1)"
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  log "soffice binary not found after install — skip"
  exit 0
fi
ln -sf "$BIN" "$TARGET"

if "$TARGET" --version >/dev/null 2>&1; then
  log "installed: $("$TARGET" --version 2>/dev/null | head -1)"
else
  log "soffice present but failed to run (missing libs?) — document preview unavailable"
  exit 0
fi

install_fonts
install_h2orestart
exit 0
