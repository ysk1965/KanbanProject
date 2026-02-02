#!/bin/bash
#
# RDS 접속 스크립트 (Dev 환경)
# Usage:
#   ./scripts/rds-connect.sh          → psql 인터랙티브 셸
#   ./scripts/rds-connect.sh "SQL"    → SQL 실행 후 종료
#
# 예시:
#   ./scripts/rds-connect.sh "\dt"
#   ./scripts/rds-connect.sh "SELECT count(*) FROM users;"
#

set -e

# ── 설정 (환경변수 또는 기본값) ──
# .env.rds 파일이 있으면 로드
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.rds" ]; then
  source "$SCRIPT_DIR/.env.rds"
fi

INSTANCE_ID="${RDS_INSTANCE_ID:?환경변수 RDS_INSTANCE_ID를 설정하세요 (.env.rds 참조)}"
INSTANCE_AZ="${RDS_INSTANCE_AZ:-ap-northeast-2a}"
INSTANCE_IP="${RDS_INSTANCE_IP:?환경변수 RDS_INSTANCE_IP를 설정하세요}"
SG_ID="${RDS_SG_ID:?환경변수 RDS_SG_ID를 설정하세요}"
RDS_HOST="${RDS_DB_HOST:?환경변수 RDS_DB_HOST를 설정하세요}"
RDS_PORT="${RDS_DB_PORT:-5432}"
RDS_DB="${RDS_DB_NAME:-kanban}"
RDS_USER="${RDS_DB_USER:-kanban_admin}"
RDS_PASS="${RDS_DB_PASS:?환경변수 RDS_DB_PASS를 설정하세요}"
LOCAL_PORT="${RDS_LOCAL_PORT:-15432}"
SSH_USER="${RDS_SSH_USER:-ec2-user}"
PSQL="${RDS_PSQL_PATH:-/opt/homebrew/opt/libpq/bin/psql}"
TMP_KEY="/tmp/.rds-connect-key-$$"

# ── 색상 ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── 정리 함수 ──
cleanup() {
  echo ""
  echo -e "${YELLOW}[정리 중]${NC} 임시 리소스 제거..."

  # SSH 터널 종료
  if [ -n "$SSH_PID" ] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null
    echo -e "  ${GREEN}✓${NC} SSH 터널 종료"
  fi

  # 보안그룹 규칙 제거
  if [ "$SG_OPENED" = "true" ]; then
    aws ec2 revoke-security-group-ingress \
      --group-id "$SG_ID" \
      --protocol tcp --port 22 \
      --cidr "${MY_IP}/32" \
      --output text 2>/dev/null && \
      echo -e "  ${GREEN}✓${NC} 보안그룹 SSH 규칙 제거" || \
      echo -e "  ${YELLOW}!${NC} 보안그룹 규칙이 이미 제거되었거나 오류 발생"
  fi

  # 임시 SSH 키 제거
  rm -f "$TMP_KEY" "${TMP_KEY}.pub" 2>/dev/null
  echo -e "  ${GREEN}✓${NC} 임시 키 제거"

  echo -e "${GREEN}[완료]${NC} 정리 완료"
}

trap cleanup EXIT

# ── 사전 체크 ──
if ! command -v aws &>/dev/null; then
  echo -e "${RED}[오류]${NC} AWS CLI가 설치되어 있지 않습니다." && exit 1
fi
if [ ! -f "$PSQL" ]; then
  echo -e "${RED}[오류]${NC} psql이 없습니다. 'brew install libpq'로 설치하세요." && exit 1
fi

# ── 1. 내 공인 IP 확인 ──
echo -e "${YELLOW}[1/5]${NC} 공인 IP 확인..."
MY_IP=$(curl -s https://checkip.amazonaws.com)
echo -e "  → ${MY_IP}"

# ── 2. 보안그룹에 SSH 허용 ──
echo -e "${YELLOW}[2/5]${NC} 보안그룹에 SSH 포트 오픈..."
SG_OPENED="false"
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 \
  --cidr "${MY_IP}/32" \
  --output text 2>/dev/null && SG_OPENED="true"

if [ "$SG_OPENED" = "true" ]; then
  echo -e "  ${GREEN}✓${NC} ${MY_IP}/32 → 포트 22 허용"
else
  echo -e "  ${YELLOW}!${NC} 이미 허용되어 있거나 오류 (계속 진행)"
  SG_OPENED="true"  # cleanup에서 제거 시도
fi

# ── 3. 임시 SSH 키 생성 & 푸시 ──
echo -e "${YELLOW}[3/5]${NC} 임시 SSH 키 생성 & EC2 Instance Connect..."
ssh-keygen -t rsa -f "$TMP_KEY" -N "" -q
aws ec2-instance-connect send-ssh-public-key \
  --instance-id "$INSTANCE_ID" \
  --instance-os-user "$SSH_USER" \
  --ssh-public-key "file://${TMP_KEY}.pub" \
  --availability-zone "$INSTANCE_AZ" \
  --output text >/dev/null
echo -e "  ${GREEN}✓${NC} SSH 키 푸시 완료 (60초 유효)"

# ── 4. SSH 터널 생성 ──
echo -e "${YELLOW}[4/5]${NC} SSH 터널 생성 (localhost:${LOCAL_PORT} → RDS:${RDS_PORT})..."
ssh -i "$TMP_KEY" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=10 \
  -o ServerAliveInterval=30 \
  -f -N \
  -L "${LOCAL_PORT}:${RDS_HOST}:${RDS_PORT}" \
  "${SSH_USER}@${INSTANCE_IP}" 2>/dev/null

SSH_PID=$(lsof -ti tcp:${LOCAL_PORT} -sTCP:LISTEN 2>/dev/null | head -1)
if [ -z "$SSH_PID" ]; then
  echo -e "  ${RED}✗${NC} SSH 터널 생성 실패" && exit 1
fi
echo -e "  ${GREEN}✓${NC} 터널 활성 (PID: ${SSH_PID})"

# ── 5. psql 접속 ──
echo -e "${YELLOW}[5/5]${NC} RDS 접속 중..."
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  DB: ${RDS_DB} | User: ${RDS_USER} | Host: localhost:${LOCAL_PORT}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -n "$1" ]; then
  # SQL 인자가 있으면 실행 후 종료
  PGPASSWORD="$RDS_PASS" "$PSQL" -h localhost -p "$LOCAL_PORT" -U "$RDS_USER" -d "$RDS_DB" -c "$1"
else
  # 인터랙티브 셸
  echo -e "  psql 셸에 접속합니다. ${YELLOW}\\q${NC}로 종료하세요."
  echo ""
  PGPASSWORD="$RDS_PASS" "$PSQL" -h localhost -p "$LOCAL_PORT" -U "$RDS_USER" -d "$RDS_DB"
fi
