# Cross-Domain Integration Phase 1 — MySpace 허브화

## Task Information
- **Task ID**: TASK-2026-0226-001
- **Date**: 2026-02-26
- **Classification**: 상 (High) — 95% confidence
- **Domain**: Fullstack (Backend + Frontend)
- **Design Doc**: `docs/versions/design-v10.0-cross-domain-integration.md`

## Summary

MySpace/Board/Organization 3개 도메인 간 데이터 사일로를 해소하여, MySpace를 개인 허브로 확장하는 Phase 1 구현을 완료했습니다. 총 4개의 크로스 도메인 API 엔드포인트를 신규 추가하고, 프론트엔드에서 3개 기존 컴포넌트를 확장 + 2개 신규 위젯을 생성했습니다.

### 구현 범위 (v10.0 Phase 1)
| Feature | 설명 | 상태 |
|---------|------|------|
| #2 통합 투데이 뷰 | Board 미완료 체크리스트/일일체크리스트/미팅을 MySpace에 노출 | ✅ |
| #3 크로스 캘린더 | 개인 이벤트 + Board 미팅/스케줄 + Org 기념일/휴가 통합 조회 | ✅ |
| #7 Org 기념일 알림 | 기념일 → MySpace 캘린더 + 축하 위젯 | ✅ |
| #8 휴가 → 캘린더 반영 | 승인 휴가 → MySpace 캘린더 자동 표시 | ✅ |
| #9 AI 다이어리 업무 회고 | 오늘 완료한 Board 작업 + 주간 요약 → 다이어리에 컨텍스트 제공 | ✅ |

## Analysis Summary

### Scope
- **Backend**: 7개 신규 파일 + 8개 수정 파일 (15개 총)
- **Frontend**: 2개 신규 파일 + 6개 수정 파일 (8개 총)
- **API**: 4개 신규 엔드포인트
- **DB 스키마**: 변경 없음 (기존 테이블 활용)

### Risk Areas
| 리스크 | 대응 | 결과 |
|--------|------|------|
| PersonalDashboardService 기존 기능 영향 | 독립 메서드(`getBoardTasks`, `getCelebrations`)로 추가, 기존 코드 무변경 | ✅ 안전 |
| 다중 Board IN절 쿼리 N+1 | 모든 Repository 쿼리에 `JOIN FETCH` 적용 | ✅ 해결 |
| BoardMemberRepository findByUserId 누락 | `findByUserIdWithActiveBoards()` 신규 추가 (deletedAt IS NULL 조건 포함) | ✅ 해결 |
| PersonalHabitService.isScheduledForDate() 접근 불가 | Repository 직접 조회로 우회 | ✅ 해결 |

## Changes Made

### Backend — 신규 파일 (7개)

| 파일 | 설명 |
|------|------|
| `domain/personal/service/PersonalCalendarService.java` | 통합 캘린더 서비스 — 개인+Board+Org 이벤트 집계 |
| `domain/personal/controller/PersonalCalendarController.java` | `GET /api/v1/personal/calendar/unified` |
| `domain/diary/service/DiaryWorkContextService.java` | 다이어리 업무 컨텍스트 — Board 완료 항목 + 주간 요약 |
| `domain/personal/dto/BoardTasksResponse.java` | 보드별 태스크 그룹 응답 DTO |
| `domain/personal/dto/UnifiedCalendarResponse.java` | 통합 캘린더 응답 DTO (개인/Board/Org 이벤트) |
| `domain/personal/dto/CelebrationsResponse.java` | 오늘의 축하 응답 DTO |
| `domain/diary/dto/DiaryWorkContextResponse.java` | 업무 컨텍스트 응답 DTO |

### Backend — 수정 파일 (8개)

| 파일 | 변경 내용 |
|------|----------|
| `BoardMemberRepository.java` | `findByUserIdWithActiveBoards()` JOIN FETCH 쿼리 추가 |
| `ChecklistItemRepository.java` | `findByAssigneeIdAndBoardIdInAndNotCompleted()`, `findCompletedByAssigneeAndBoardIdsAndDateRange()` 추가 |
| `DailyChecklistRepository.java` | `findByAssigneeIdAndBoardIdInAndAssignedDate()` 추가 |
| `MeetingRepository.java` | `findByBoardIdInAndMeetingDateBetween()` 추가 |
| `ScheduleBlockRepository.java` | `findByAssigneeIdAndBoardIdInAndScheduledDateBetween()` 추가 |
| `LeaveRequestRepository.java` | `findApprovedByOrgIdInAndDateRange()` 추가 |
| `PersonalDashboardService.java` | `getBoardTasks()`, `getCelebrations()` 메서드 + 7개 Repository 의존성 추가 |
| `PersonalDashboardController.java` | `/board-tasks`, `/celebrations` 엔드포인트 추가 |
| `DiaryController.java` | `/work-context` 엔드포인트 추가 |

### Frontend — 신규 파일 (2개)

| 파일 | 설명 |
|------|------|
| `components/personal/BoardTasksWidget.tsx` | 보드 할 일 위젯 — WidgetCard 패턴, 보드별 그룹, 체크 토글 |
| `components/personal/CelebrationsWidget.tsx` | 오늘의 축하 위젯 — 조건부 렌더링, 핑크 그라데이션 |

### Frontend — 수정 파일 (6개)

| 파일 | 변경 내용 |
|------|----------|
| `types/index.ts` | 12개 크로스 도메인 인터페이스 추가 |
| `utils/api.ts` | `personalDashboardAPI.getBoardTasks/getCelebrations`, `personalCalendarAPI.getUnifiedCalendar`, `diaryAPI.getWorkContext` |
| `utils/services.ts` | 4개 서비스 래퍼 + `personalCalendarService` 신규 |
| `PersonalOverview.tsx` | BoardTasksWidget + CelebrationsWidget 삽입 |
| `PersonalCalendar.tsx` | 크로스 도메인 이벤트 도트(4색) + 필터 칩 5개 |
| `PersonalDiary.tsx` | 업무 컨텍스트 카드 (Board 완료 그룹 + 주간 요약) |

## API Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/personal/dashboard/board-tasks?date=` | 보드별 미완료 태스크 그룹 |
| GET | `/api/v1/personal/dashboard/celebrations?date=` | 오늘의 축하 (기념일/입사일) |
| GET | `/api/v1/personal/calendar/unified?start_date=&end_date=` | 통합 캘린더 이벤트 |
| GET | `/api/v1/diary/work-context?date=` | 다이어리 업무 컨텍스트 |

## Decision Log

### D-001: Contract-First 병렬 개발 전략
- **맥락**: BE 4개 API + FE 5개 컴포넌트를 효율적으로 병렬 구현해야 함
- **결정**: 4개 Upfront Contract(UC-001~004) 정의 후, BE/FE를 2개 병렬 그룹으로 분리
- **근거**: SA-001(Repo)→SA-002(BE Service) 의존성, SA-003(Types)→SA-004(Components) 의존성을 그룹으로 묶어 병렬화
- **결과**: 4 SubAgent 전부 1차 시도에 성공

### D-002: 기존 서비스 확장 vs 신규 서비스 분리
- **맥락**: PersonalDashboardService에 Board/Org 데이터 조회 로직 추가 필요
- **결정**: `getBoardTasks()`, `getCelebrations()`는 기존 서비스에 추가, `getUnifiedCalendar()`과 `getWorkContext()`는 별도 서비스 분리
- **근거**: Dashboard 관련 기능은 기존 서비스 확장이 자연스럽고, Calendar/Diary는 도메인 책임이 다름
- **결과**: PersonalCalendarService(신규), DiaryWorkContextService(신규) 생성

### D-003: DB 스키마 무변경 결정
- **맥락**: Phase 1 기능이 기존 테이블 데이터 조합으로 구현 가능
- **결정**: Flyway 마이그레이션 불필요, 기존 테이블 + 새 JOIN FETCH 쿼리로 해결
- **근거**: Board(Meeting, ScheduleBlock, ChecklistItem, DailyChecklist) + Org(Anniversary, LeaveRequest) 엔티티가 이미 존재
- **결과**: 배포 리스크 최소화

### D-004: PersonalHabitService 접근 문제 우회
- **맥락**: DiaryWorkContextService에서 `PersonalHabitService.isScheduledForDate()` 호출 필요했으나 package-private
- **결정**: PersonalHabitRepository + PersonalHabitLogRepository 직접 조회
- **근거**: 서비스 접근 제한을 변경하면 기존 캡슐화 깨짐, Repository 조회가 더 안전
- **결과**: 정상 동작, 기존 코드 무변경

### D-005: 캘린더 도트 색상 체계
- **맥락**: 캘린더 셀에 도메인별 이벤트를 시각적으로 구분해야 함
- **결정**: 보라(Board Meeting), 인디고(Board Schedule), 핑크(Org Anniversary), 초록(Org Leave) 4색
- **근거**: Bridge 디자인 시스템의 accent 컬러 팔레트와 조화, 직관적 의미 전달

## SubAgent Summary

| SubAgent | Group | 역할 | 모델 | 결과 | 파일 수 |
|----------|-------|------|------|------|---------|
| SA-001 | A | Backend Repository 확장 | Sonnet | ✅ 1차 성공 | 6개 수정 |
| SA-003 | A | Frontend Types/API/Services | Sonnet | ✅ 1차 성공 | 3개 수정 |
| SA-002 | B | Backend Services/DTOs/Controllers | Opus | ✅ 1차 성공 | 7개 신규 + 3개 수정 |
| SA-004 | B | Frontend Components | Opus | ✅ 1차 성공 | 2개 신규 + 3개 수정 |

**실행 순서**: Group A (병렬) → Group B (병렬, A 의존)

## Test Results

| 검증 | 결과 | 비고 |
|------|------|------|
| Backend `./gradlew build` | ✅ BUILD SUCCESSFUL | 전체 빌드 + 테스트 통과 |
| Frontend `npm run build` | ✅ built in 11.46s | 3665 모듈 컴파일 성공 |
| PWA chunk size warning | ⚠️ 기존 이슈 | `vite-plugin-pwa` 5.39MB 경고 (변경 무관) |

## Architecture Impact

### 신규 레이어 추가
```
MySpace Personal Domain
├── PersonalDashboardService (확장: +getBoardTasks, +getCelebrations)
├── PersonalCalendarService (신규: getUnifiedCalendar)
│   └── Board Domain 참조: BoardMemberRepo, MeetingRepo, ScheduleBlockRepo
│   └── Org Domain 참조: OrgMemberRepo, OrgAnniversarySettingRepo, LeaveRequestRepo
│   └── Personal Domain 참조: PersonalEventRepo
└── DiaryWorkContextService (신규: getWorkContext)
    └── Board Domain 참조: BoardMemberRepo, ChecklistItemRepo, DailyChecklistRepo, MeetingRepo
    └── Personal Domain 참조: PersonalTaskRepo, PersonalHabitRepo, PersonalHabitLogRepo
```

### 크로스 도메인 데이터 플로우
```
Board Domain ──┐
               ├──→ PersonalCalendarService ──→ /calendar/unified
Org Domain ────┘
               ├──→ PersonalDashboardService ──→ /board-tasks, /celebrations
Board Domain ──┘
               ├──→ DiaryWorkContextService ──→ /diary/work-context
Personal Domain┘
```

### 기존 코드 영향
- **영향 없음**: 기존 `getTodayDashboard()`, `getOverview()` 메서드 무변경
- **영향 없음**: 기존 PersonalCalendar 개인 이벤트 로직 무변경 (additive only)
- **영향 없음**: 기존 DiaryController 엔드포인트 무변경

## Future Considerations

### Phase 2 확장 방향 (v10.0 Roadmap)
- **Feature #1**: Board → 리소스 센터 (팀 노트, 문서, 링크 통합)
- **Feature #4**: Board Task → 개인 태스크 자동 연동
- **Feature #5**: Org 공지 → Board 알림 브로드캐스트
- **Feature #6**: Board 스탠드업 → Org 리포트 자동 집계
- **Feature #10**: 통합 검색 (MySpace에서 전체 도메인 검색)

### 확장성 고려 사항
1. **PersonalCalendarService**: 이벤트 소스(Board/Org) 추가 시 `getUnifiedCalendar()`에 새 수집 로직만 append
2. **UnifiedCalendarResponse**: `source` enum 필드로 이벤트 출처 구분 → 새 도메인 추가 용이
3. **Repository 쿼리 패턴**: `findBy...AndBoardIdIn()` 패턴으로 다중 Board 조회 표준화
4. **Filter Chip UI**: PersonalCalendar 필터 상태를 Set으로 관리 → 새 소스 칩 추가 용이

### 성능 최적화 후보
- Board 수가 많은 사용자 (10+): IN절 파라미터 제한 고려
- 캘린더 월 단위 조회: Redis 캐싱 적용 가능
- DiaryWorkContext 주간 요약: 배치 사전 계산 고려

## Tags
`cross-domain` `myspace` `calendar` `dashboard` `diary` `phase1` `v10.0`
