# Discord Incoming Webhook 연동

## Task Information
- **Task ID**: TASK-2026-0309-001
- **Date**: 2026-03-09
- **Classification**: 상
- **Domain**: Fullstack (BE + FE)
- **SubAgents**: SA-001 (Foundation), SA-002 (API Layer), SA-003 (Notification), SA-004 (Frontend)

## Summary
Slack 연동과 동일한 구조로 Discord Incoming Webhook 기반 5종 알림을 지원하는 기능을 추가했습니다.
기존 Slack 연동과 완전히 독립적으로 공존하며, Premium 전용 기능으로 알림 타입별 ON/OFF 개별 관리가 가능합니다.

**핵심 차이점**: Discord는 Slack Block Kit 대신 **Embed 포맷**을 사용하며, 액션 버튼 대신 마크다운 링크를 사용합니다.

## Analysis Summary
- **Scope**: 12개 신규 파일 + 17개 수정 파일 (총 29개)
- **Risk Areas**:
  - `NotificationPreference.update()` 메서드 파라미터 확장 (10→15개) — SA-003에서 caller 동기화 완료
  - Discord Embed 포맷이 Slack Block Kit과 완전히 다름 — 별도 페이로드 빌드 구현
  - Caller 서비스 4개에 Discord 알림 호출 추가 — 모두 `@Async` 비동기 처리

## Changes Made

### Backend — 신규 파일 (9개)

| 파일 | 설명 |
|------|------|
| `integration/discord/MemberDiscordWebhook.java` | JPA Entity (board, user, webhookUrl, channelName, enabled) |
| `integration/discord/MemberDiscordWebhookRepository.java` | Repository + JOIN FETCH 쿼리 |
| `integration/discord/controller/DiscordWebhookController.java` | REST API 5개 엔드포인트 |
| `integration/discord/service/DiscordWebhookService.java` | 웹훅 CRUD + URL 검증 + 테스트 발송 |
| `integration/discord/service/DiscordNotificationService.java` | 5종 Discord Embed 알림 서비스 |
| `integration/discord/dto/DiscordWebhookRequest.java` | 요청 DTO (Upsert) |
| `integration/discord/dto/DiscordWebhookResponse.java` | 응답 DTO (Detail, MemberStatus, TestResult) |
| `integration/BrandResolver.java` | slack → 공통 패키지로 이동 |
| `db/migration/V20260309_120000__create_member_discord_webhooks.sql` | 테이블 + UK + 인덱스 생성 |
| `db/migration/V20260309_120001__add_discord_notification_preferences.sql` | discord_* 컬럼 5개 추가 |

### Backend — 수정 파일 (10개)

| 파일 | 변경 내용 |
|------|----------|
| `Board.java` | `canAccessDiscord()` 메서드 추가 |
| `ErrorCode.java` | DK001~DK004 에러코드 추가 |
| `NotificationPreference.java` | discord_* 필드 5개 + `isDiscordEnabled()` + `update()` 확장 |
| `NotificationPreferenceRequest.java` | discord_* Boolean 필드 5개 추가 |
| `NotificationPreferenceResponse.java` | discord_* 필드 + of()/defaultPreference() 업데이트 |
| `NotificationPreferenceService.java` | update() 호출부 + builder 동기화 |
| `SchemaMigrationInitializer.java` | discord_* 컬럼 H2 호환 패치 추가 |
| `CommentService.java` | DiscordNotificationService 주입 + 알림 호출 추가 |
| `ChecklistService.java` | DiscordNotificationService 주입 + 알림 호출 추가 (×2) |
| `MeetingService.java` | DiscordNotificationService 주입 + 알림 호출 추가 |
| `NoteCommentService.java` | DiscordNotificationService 주입 + 알림 호출 추가 |
| `SlackWebhookService.java` | BrandResolver import 경로 변경 |

### Frontend — 신규 파일 (2개)

| 파일 | 설명 |
|------|------|
| `DiscordSettingsPanel.tsx` | Discord 설정 패널 (연결/수정/테스트/삭제) |
| `DiscordGuideModal.tsx` | 5단계 Discord 웹훅 설정 가이드 모달 |

### Frontend — 수정 파일 (15개)

| 파일 | 변경 내용 |
|------|----------|
| `api.ts` | DiscordWebhookConfig/TestResult/MemberStatus 인터페이스 + discordWebhookAPI 5메서드 |
| `types/index.ts` | NotificationPreferences에 discord_* 필드 5개 추가 |
| `NotificationDropdown.tsx` | DiscordSettingsPanel 통합 + canAccessDiscord/onDiscordUpgrade props |
| `NotificationPreferencesPanel.tsx` | Discord 토글 컬럼 추가 (3번째 열) |
| `i18n/locales/*.json` (10개) | discordGuide, discordSettings, notificationPreferences 번역 키 추가 |

## Decision Log

| # | 결정 | 근거 |
|---|------|------|
| 1 | Slack 패키지와 완전 분리된 `integration/discord` 패키지 구조 | 독립 공존 요구사항 + 유지보수 용이성 |
| 2 | Discord Embed 포맷 사용 (Block Kit X) | Discord Incoming Webhook은 Embed만 지원 |
| 3 | Bridge Accent 색상 `0x6366F1` 사용 | 브랜드 일관성 (Slack은 별도 블록 스타일) |
| 4 | 마크다운 링크로 "보드에서 보기" 구현 | Discord Incoming Webhook은 버튼 미지원 |
| 5 | `BrandResolver`를 공통 `integration` 패키지로 이동 | Discord→Slack 간 크로스 패키지 의존성 제거 |
| 6 | `canAccessDiscord`를 `canAccessSlack`과 분리된 props로 설계 | 향후 독립 접근 제어 가능성 대비 |

## Test Results

| 검증 항목 | 결과 |
|----------|------|
| Backend `compileJava` | PASS |
| Frontend `npm run build` | PASS |
| API contract 검증 (UC-001, 5 endpoints) | PASS |
| DTO ↔ TypeScript 타입 매핑 | PASS |
| NotificationPreference 필드 동기화 (BE↔FE) | PASS |
| 컴포넌트 통합 (NotificationDropdown) | PASS |
| 코드 품질 리뷰 (5건 수정) | PASS |

### 코드 리뷰에서 수정된 항목
1. Discord Embed 컬러 상수 오류 (`6366961` → `0x6366F1`)
2. `canAccessDiscord` prop 커플링 분리 (`canAccessSlack` 재사용 → 독립 prop)
3. `placeholder-slate-600` → `placeholder-slate-500` (디자인 시스템 통일)
4. `focus:ring-1` → `focus:ring-2` (디자인 시스템 통일)
5. `BrandResolver` 크로스 패키지 의존성 해소

## Architecture Impact

### 신규 모듈
```
domain/integration/discord/           ← 신규 패키지
├── MemberDiscordWebhook.java         ← Entity
├── MemberDiscordWebhookRepository.java
├── controller/
│   └── DiscordWebhookController.java ← 5 endpoints
├── service/
│   ├── DiscordWebhookService.java    ← CRUD
│   └── DiscordNotificationService.java ← 알림 발송
└── dto/
    ├── DiscordWebhookRequest.java
    └── DiscordWebhookResponse.java

domain/integration/BrandResolver.java ← slack → 공통으로 이동
```

### DB 스키마 변경
- 신규 테이블: `member_discord_webhooks` (FK: boards, users)
- 컬럼 추가: `notification_preferences.discord_*_enabled` × 5

### 알림 호출 체인
```
Comment/Checklist/Meeting/NoteComment Service
  ├── SlackNotificationService.send*()    ← 기존
  └── DiscordNotificationService.send*()  ← 신규 추가
        ↓
  NotificationPreference.isDiscordEnabled(type)
        ↓
  MemberDiscordWebhookRepository.findByBoardIdAndUserIdInAndEnabledTrue()
        ↓
  Discord Embed JSON → POST webhookUrl
```

## API Endpoints (UC-001)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/boards/{boardId}/discord-webhook/statuses` | 멤버별 연결 상태 조회 |
| GET | `/api/v1/boards/{boardId}/discord-webhook/me` | 내 설정 조회 |
| PUT | `/api/v1/boards/{boardId}/discord-webhook/me` | 설정 생성/수정 |
| DELETE | `/api/v1/boards/{boardId}/discord-webhook/me` | 설정 삭제 |
| POST | `/api/v1/boards/{boardId}/discord-webhook/me/test` | 테스트 메시지 발송 |

## Future Recommendations
1. **Discord 가이드 이미지**: `DiscordGuideModal`에 스크린샷 추가 시 UX 향상
2. **추상화 검토**: Slack/Discord 통합 `WebhookNotificationService` 인터페이스 (현재는 YAGNI)
3. **Rate Limiting**: Discord API rate limit (30 req/min per webhook) 대응 고려
4. **Webhook 유효성 검증**: 주기적 ping으로 만료/삭제된 웹훅 감지
