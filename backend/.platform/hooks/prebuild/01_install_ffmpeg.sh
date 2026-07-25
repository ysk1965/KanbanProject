#!/usr/bin/env bash
#
# EB prebuild hook — 슬랙 영상 압축(VideoCompressionService)에 필요한 ffmpeg/ffprobe 설치.
#
# Amazon Linux 2 / 2023 기본 저장소에는 라이선스 문제로 ffmpeg가 없다. 그래서 정적(static)
# 빌드를 내려받아 /usr/bin/ffmpeg, /usr/bin/ffprobe 로 설치한다(FFMPEG_PATH 기본값과 일치).
#
# 설계 원칙:
#   - 멱등: 이미 동작하는 ffmpeg가 있으면 건너뛴다(롤링 배포로 인스턴스가 유지되는 경우 재다운로드 방지).
#   - best-effort: 다운로드/설치가 실패해도 exit 0. 앱 코드가 ffmpeg 부재를 감지해 원본 영상으로
#     graceful fallback 하므로, 서드파티 다운로드 장애가 배포 전체를 깨뜨리지 않게 한다.
#
set -uo pipefail

TARGET_FFMPEG=/usr/bin/ffmpeg
TARGET_FFPROBE=/usr/bin/ffprobe
LOG_PREFIX="[ffmpeg-hook]"

log() { echo "${LOG_PREFIX} $*"; }

# 1) 이미 설치돼 있으면 스킵
if [ -x "$TARGET_FFMPEG" ] && "$TARGET_FFMPEG" -version >/dev/null 2>&1; then
  log "already installed: $("$TARGET_FFMPEG" -version 2>/dev/null | head -1)"
  exit 0
fi

# 2) 아키텍처 판별 (x86_64 / Graviton arm64 모두 지원)
case "$(uname -m)" in
  x86_64)  ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) log "unsupported arch $(uname -m) — skip (video compression falls back to original)"; exit 0 ;;
esac

URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${ARCH}-static.tar.xz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 3) 다운로드 (실패해도 배포는 계속)
log "downloading $URL"
if ! curl -fsSL --retry 3 --retry-delay 2 --max-time 180 -o "$TMP/ffmpeg.tar.xz" "$URL"; then
  log "download failed — skip (video compression falls back to original)"
  exit 0
fi

# 4) 압축 해제
if ! tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"; then
  log "extract failed — skip"
  exit 0
fi

DIR="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*-static' | head -1)"
if [ -z "$DIR" ] || [ ! -x "$DIR/ffmpeg" ]; then
  log "unexpected archive layout — skip"
  exit 0
fi

# 5) 설치
if install -m 0755 "$DIR/ffmpeg" "$TARGET_FFMPEG" && install -m 0755 "$DIR/ffprobe" "$TARGET_FFPROBE"; then
  log "installed: $("$TARGET_FFMPEG" -version 2>/dev/null | head -1)"
else
  log "install step failed — skip"
fi

exit 0
