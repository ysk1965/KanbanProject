# TASK-2026-0310-001: Discord Bot Integration

**Date**: 2026-03-10
**Level**: 상
**Type**: Feature Overhaul
**Status**: Completed

## Summary

Discord 연동을 Webhook 기반에서 Bot 기반으로 전면 개편하였습니다.
- **Before**: 각 멤버가 Discord Webhook URL을 복사하여 등록 → 단방향 알림만 가능
- **After**: Board Owner가 OAuth로 Bot 초대 → 멤버가 OAuth로 계정 연동 → Bot이 DM으로 알림 + 버튼 인터랙션

## Analysis

### 기존 구조 (Webhook)
- `MemberDiscordWebhook` 엔티티: 멤버별 webhook URL 저장
- `DiscordWebhookService`: URL 검증, CRUD, 테스트 전송
- `DiscordNotificationService`: 5개 알림 메서드, RestTemplate으로 webhook POST
- `DiscordWebhookController`: 5개 엔드포인트 (/me 기반 CRUD)

### 문제점
1. **단방향**: BRIDGE → Discord만 가능, Discord에서 액션 불가
2. **설정 번거로움**: 각 멤버가 Discord 서버 설정 → Webhook 생성 → URL 복사 필요
3. **인터랙션 불가**: 버튼, 슬래시 커맨드 등 양방향 기능 미지원
4. **개인 DM 불가**: Webhook은 채널 단위 → 개인별 멘션 알림 부적합

## Decisions

| 결정 | 이유 | 대안 |
|------|------|------|
| Discord REST API 직접 호출 | 외부 라이브러리 최소화 (JDA/discord4j 미사용) | JDA 사용 시 WebSocket 연결 필요 → 서버 리소스 과다 |
| OAuth2 2-track (Bot 초대 + User 연동) | Bot 초대는 Board Owner만, 계정 연동은 각 멤버 | 단일 OAuth로 둘 다 처리 시 권한 구분 어려움 |
| HMAC 기반 OAuth state 검증 | JWT secret 재사용, 10분 만료 | 별도 state 저장소 (Redis) 불필요 |
| 알림 메서드 시그니처 유지 | 4개 caller 서비스 무변경 | 시그니처 변경 시 CommentService 등 전부 수정 필요 |
| DM 기반 알림 (채널 아닌 개인 DM) | 멘션 알림은 개인별 전달 필수 | 채널 멘션은 정보 과다 + 프라이버시 이슈 |

## SubAgent Summary

| ID | 설명 | 파일 수 | 모델 |
|----|------|--------|------|
| SA-001 | Backend 인프라 (Migration, Entity, Config) | 9 | Opus |
| SA-002 | Backend 서비스 + 컨트롤러 | 8 | Opus |
| SA-003 | Frontend 전면 개편 | 12 | Opus |

## Changes

### Backend — 신규 (6개)
- `DiscordBotConfig.java` — 보드별 Bot 설정 엔티티 (guild_id, channel_id)
- `DiscordUserLink.java` — 유저별 Discord 계정 연동 (discord_user_id, tokens)
- `DiscordBotConfigRepository.java` — Bot 설정 조회/삭제
- `DiscordUserLinkRepository.java` — 유저 연동 조회/배치 조회
- `DiscordBotService.java` — Discord REST API 클라이언트 (DM, 채널, OAuth)
- `DiscordService.java` — 비즈니스 로직 (OAuth URL, 콜백, CRUD)

### Backend — 수정 (5개)
- `DiscordController.java` — 10개 엔드포인트로 개편 (OAuth + Bot 관리)
- `DiscordNotificationService.java` — Webhook POST → Bot DM + 버튼 컴포넌트
- `DiscordRequest.java` — UpdateChannel DTO
- `DiscordResponse.java` — BotConfig, UserLinkStatus, ChannelInfo, MemberStatus, OAuthUrl, TestResult
- `SecurityConfig.java` — OAuth 콜백 permitAll 추가

### Backend — 삭제 (4개)
- `MemberDiscordWebhook.java` — Webhook 엔티티 제거
- `MemberDiscordWebhookRepository.java` — Webhook 리포지토리 제거
- `DiscordWebhookService.java` — Webhook 서비스 제거
- `DiscordWebhookController.java` — Webhook 컨트롤러 제거

### Infrastructure (3개)
- `V20260310_093453__discord_bot_integration.sql` — 신규 테이블 2개 + 기존 테이블 드롭
- `application.yml` — discord.client-id, client-secret, bot-token, redirect-uri
- `ErrorCode.java` — DK001-DK007 Bot 관련 에러코드

### Frontend — 수정 (12개)
- `DiscordSettingsPanel.tsx` — OAuth 기반 3-state UI
- `api.ts` — `discordAPI` 9개 메서드
- `NotificationDropdown.tsx` — 프롭 업데이트
- `i18n/locales/*.json` × 10개 — `discordBot` 키 (22개 × 10개 언어)

### Frontend — 삭제 (1개)
- `DiscordGuideModal.tsx` — Webhook 가이드 불필요

### 호출부 무변경 (4개 서비스)
- CommentService, ChecklistService, MeetingService, NoteCommentService

## Test Summary

| 검증 | 결과 |
|------|------|
| Backend Build (`./gradlew build -x test`) | ✅ BUILD SUCCESSFUL |
| Frontend Build (`npm run build`) | ✅ built successfully |
| TypeScript 타입 체크 | ✅ 통과 (빌드에 포함) |

## Architecture Impact

### 새로운 패턴
- **Discord OAuth2 2-track**: Bot 초대(guild scope)와 User 연동(identify scope) 분리
- **HMAC State 검증**: JWT secret 기반, Redis 불필요한 stateless 방식
- **Bot DM with Components**: Discord Message Components (Link Button) 포함 알림

### DB 스키마 변경
- `discord_bot_configs` (신규): 보드-길드 1:1 매핑
- `discord_user_links` (신규): 유저-디스코드계정 1:1 매핑
- `member_discord_webhooks` (삭제): 기존 Webhook 테이블

### API 변경 (Breaking)
- 기존 `/api/v1/boards/{boardId}/discord-webhook/*` 제거
- 신규 `/api/v1/boards/{boardId}/discord/*` (10개 엔드포인트)
- OAuth 콜백 `/api/v1/discord/oauth/callback`

## Future Considerations

1. **Slash Commands**: `/bridge status`로 보드 현황 조회 (Interaction Endpoint 필요)
2. **Channel 알림**: DM 외에 팀 채널에도 알림 전송 옵션
3. **Button Interactions**: "완료" 버튼으로 체크리스트 완료 처리 (Interaction Endpoint 필요)
4. **Token Encryption**: Discord access/refresh token 암호화 (현재 평문 저장)

## Tags
`discord`, `bot`, `oauth2`, `notification`, `integration`, `premium`
