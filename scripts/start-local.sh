#!/bin/bash
# BRIDGE Backend 로컬 실행 스크립트
# API 키를 macOS Keychain에서 로드하여 환경변수로 주입합니다.
#
# 사전 설정 (최초 1회):
#   security add-generic-password -s "bridge-claude-api-key" -a "$USER" -w "YOUR_API_KEY"
#   security add-generic-password -s "bridge-openai-api-key" -a "$USER" -w "YOUR_API_KEY"
#
# 키 업데이트:
#   security delete-generic-password -s "bridge-claude-api-key" -a "$USER"
#   security add-generic-password -s "bridge-claude-api-key" -a "$USER" -w "NEW_API_KEY"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# macOS Keychain에서 시크릿 로드
load_keychain_secret() {
  local service_name="$1"
  local secret
  secret=$(security find-generic-password -s "$service_name" -a "$USER" -w 2>/dev/null) || {
    echo "⚠ Keychain에 '$service_name' 없음. 아래 명령으로 등록하세요:"
    echo "  security add-generic-password -s \"$service_name\" -a \"\$USER\" -w \"YOUR_KEY\""
    return 1
  }
  echo "$secret"
}

echo "🔐 macOS Keychain에서 API 키 로드 중..."

# Claude API Key
CLAUDE_KEY=$(load_keychain_secret "bridge-claude-api-key") || true
if [ -n "$CLAUDE_KEY" ]; then
  export CLAUDE_API_KEY="$CLAUDE_KEY"
  echo "  ✓ CLAUDE_API_KEY 로드 완료"
else
  echo "  ✗ CLAUDE_API_KEY 미설정 (AI 기능 비활성화)"
fi

# OpenAI API Key (선택)
OPENAI_KEY=$(load_keychain_secret "bridge-openai-api-key") || true
if [ -n "$OPENAI_KEY" ]; then
  export OPENAI_API_KEY="$OPENAI_KEY"
  echo "  ✓ OPENAI_API_KEY 로드 완료"
fi

echo ""
echo "🚀 Backend 시작 (local 프로파일)..."
cd "$PROJECT_DIR/backend"
./gradlew bootRun --args='--spring.profiles.active=local'
