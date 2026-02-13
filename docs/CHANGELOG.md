# Documentation Changelog

## [2026-02-13] v1.6.0

### IA v1.6.0
- Added: Monitoring 도메인 모듈 (`domain/monitoring/`) - JVM/DB/API 메트릭, CloudWatch, Slack 알림
- Added: WebSocket 인프라 (`global/websocket/`) - STOMP 실시간 보드 동기화 (26+ 이벤트 타입)
- Added: `global/config/WebSocketConfig.java`, `CloudWatchConfig.java`, `WebMvcConfig.java`
- Added: `global/interceptor/ApiMetricsInterceptor.java` - API 메트릭 수집
- Added: `global/scheduler/MonitoringScheduler.java` - 메트릭 플러시/알림 체크/데이터 정리
- Added: `components/notes/blocks/` - BlockNote 커스텀 블록 7종
- Added: `components/MeetingCalendarView.tsx` - 미팅 월간 캘린더
- Added: `components/admin/AdminMonitoringTab.tsx`, `MonitoringCharts.tsx`
- Added: `hooks/useBoardWebSocket.ts`, `utils/websocket.ts` - WebSocket 클라이언트
- Added: `styles/blocknote-dark.css` - BlockNote 다크 테마
- Changed: Backend 도메인 패키지 26개 → 27개 (+ monitoring)
- Changed: Flyway 마이그레이션 V16 → V30
- Changed: Meeting 엔티티 반복 미팅 지원 (recurrence 필드)
- Removed: NoteEditorToolbar.tsx, TableBubbleMenu.tsx, CustomTableCell.ts, CustomTableHeader.ts
- Removed: tiptap.css (BlockNote로 대체)

### Wireframe v1.6.0
- Added: MeetingCalendarView - 월간 미팅 캘린더 (날짜별 미팅 표시, 반복 미팅 뱃지)
- Added: NoteEditor BlockNote 마이그레이션 (7개 커스텀 블록: Callout, Toggle, Divider, ColumnLayout, Embed, Mention, TableOfContents)
- Added: AdminMonitoringTab - 시스템 모니터링 대시보드 (JVM/DB/API 메트릭, 알림 설정)
- Added: MonitoringCharts - API 메트릭 시각화 (Line/Area/Bar 차트)
- Changed: MeetingView - 반복 미팅 UI (규칙 선택, 범위 선택: 이 미팅만/이후 모든 미팅)
- Changed: Admin 사이드바 - 모니터링 탭 추가
- Removed: Tiptap 에디터 관련 컴포넌트 (NoteEditorToolbar, TableBubbleMenu)

### ERD v1.6.0
- Added: api_metric_snapshots 테이블 (V30, API 메트릭 스냅샷, 인덱스 2개)
- Added: monitoring_config 테이블 (V30, 모니터링 설정 키-값)
- Changed: Meeting 테이블 - recurrence_rule, recurrence_group_id, recurrence_end_date 컬럼 추가 (V29, 인덱스 2개)
- Added: Migration V17~V30 (14개 추가)

### API v1.6.0
- Added: Monitoring API (6개 엔드포인트 - dashboard, api-metrics/history, cloudwatch, alert-config GET/PUT, alert-test)
- Added: WebSocket 엔드포인트 (/ws STOMP over SockJS, 26+ 이벤트 타입)
- Changed: Meeting API - PUT/DELETE에 scope 파라미터 추가 (THIS_ONLY, THIS_AND_FUTURE)
- Changed: Meeting 생성/응답에 recurrence 필드 추가

### Design v1.4.0
- Added: BlockNote 다크 테마 스타일 (blocknote-dark.css, Bridge 디자인 시스템 컬러 적용)
- Added: 커스텀 블록 스타일 가이드 (Callout, Toggle, Divider, ColumnLayout, Embed, Mention, TableOfContents)
- Added: 모니터링 대시보드 스타일 (메트릭 카드, 차트 컬러)
- Removed: tiptap.css 스타일 (BlockNote로 대체)

### Tech v1.6.0
- Added: WebSocket/STOMP 인프라 (spring-boot-starter-websocket, @stomp/stompjs 7.3.0)
- Added: BlockNote 에디터 (@blocknote/core, @blocknote/react, @blocknote/mantine v0.28.0)
- Added: AWS CloudWatch SDK 2.25.0 연동
- Added: Monitoring 도메인 (ApiMetricsInterceptor, MonitoringScheduler, CloudWatch)
- Added: WebSocket 인프라 (WebSocketConfig, BoardEventType 26+, WebSocketAuthInterceptor)
- Changed: Flyway V17~V30 마이그레이션 추가 (V29 meeting recurrence, V30 monitoring)
- Changed: Meeting 반복 지원 (recurrenceRule, scope-based update/delete)
- Removed: Tiptap 에디터 의존성 (BlockNote로 대체)

---

## [2026-02-08] v1.5.0

### IA v1.5.0
- Added: Report 도메인 모듈 (`domain/report/`) - AI 리포트 생성/관리
- Added: Standup 도메인 모듈 (`domain/standup/`) - 데일리 스탠드업 자동 발송
- Added: `global/config/AIConfig.java` - Claude AI RestTemplate 설정
- Added: `/compare` 라우트 (경쟁사 비교 페이지)
- Added: ComparisonPage, AIReportDiagram 컴포넌트
- Added: i18n 10개 언어 지원 (ko, en, ja, zh, zh-TW, hi, vi, es, pt-BR, th)
- Changed: Backend 도메인 패키지 24개 → 26개
- Changed: Flyway 마이그레이션 V14 → V16
- Changed: Trial 기간 7일 → 3일
- Removed: Feature.priority 필드

### Wireframe v1.5.0
- Added: ComparisonPage (`/compare`) - 경쟁사 비교 페이지 (기능 매트릭스, 가격 차트)
- Added: 랜딩 페이지 AI Intelligence 섹션 (AI 리포트, 스탠드업, 인사이트)
- Added: AIReportDiagram (데이터 소스 → Claude AI → 리포트 미리보기)
- Added: AIReportPanel 반응형 레이아웃 (모바일 오버레이, 태블릿+ 사이드바)
- Added: ManagementView 반응형 레이아웃 (2열/4열 그리드, 스크롤 탭)
- Changed: LanguageSwitcher 10개 언어 지원, 플래그 이모지 제거
- Changed: TrialBanner - onOpenPremiumBenefits 콜백, Trial 3일
- Changed: 랜딩 페이지 내비게이션에 "AI", "Compare" 링크 추가
- Changed: Premium 기능 목록에 "AI sprint report & insights" 추가
- Removed: FeatureDetailModal Priority Selector
- Removed: FeatureCard Priority Badge

### ERD v1.5.0
- Added: weekly_reports 테이블 (AI 생성 주간 리포트, 인덱스 3개)
- Added: daily_standup_configs 테이블 (스탠드업 스케줄 설정, 인덱스 1개)
- Added: Board → WeeklyReport (1:N), User → WeeklyReport (1:N), Board ↔ DailyStandupConfig (1:1) 관계
- Removed: Feature.priority 컬럼 (V15 마이그레이션)

### API v1.5.0
- Added: Reports API (4개 엔드포인트 - 생성/목록/상세/재생성)
- Added: Daily Standup Config API (2개 엔드포인트 - GET/PUT standup-config)
- Added: 에러 코드 AD002~AD003, SK004, AR001~AR004 (7개)
- Changed: 섹션 번호 재정렬 (31개 섹션)
- Removed: Feature 생성/수정 API에서 priority 필드 제거

### Design v1.3.0
- Added: `.scrollbar-hide` 유틸리티 클래스 (모바일 수평 스크롤)
- Added: 반응형 디자인 패턴 (flex-col/row 토글, 반응형 그리드, 모바일 오버레이)
- Added: Split Title 타이포그래피 패턴 (titleLine1/titleLine2)
- Deprecated: Priority Badges (.badge-high, .badge-medium, .badge-low)

### Tech v1.5.0
- Added: Claude AI API 통합 (Sonnet/Haiku 모델 분리, 프롬프트 캐싱)
- Added: DailyStandupScheduler (매분 실행, 타임존 변환, Slack Block Kit)
- Added: i18n 10개 언어 지원 (8개 신규 로케일 파일)
- Added: AIConfig.java (RestTemplate 10s/60s 타임아웃)
- Added: 환경변수 CLAUDE_API_KEY, CLAUDE_MODEL_TEAM/PERSONAL/STANDUP
- Added: Terraform EB 모듈 CLAUDE_API_KEY 지원
- Changed: Flyway V15 (priority 제거), V16 (weekly_reports + standup_configs)
- Changed: Trial 기간 7일 → 3일

---

## [2026-02-07] v1.4.0

### IA v1.4.0
- Added: AnalyticsContext (Firebase Analytics 이벤트 추적 Context)
- Added: NotificationPreferencesPanel 컴포넌트

### Wireframe v1.4.0
- Added: NotificationPreferencesPanel 컴포넌트 (NotificationDropdown 내 알림 설정 패널)
- Changed: NotificationDropdown 구조 업데이트

### ERD v1.4.0
- Added: notification_preferences 테이블 (유저별/보드별 인앱+Slack 알림 설정)
- Changed: Notification.type enum 확장 (COMMENT_MENTION → +CHECKLIST_ASSIGNED, +TASK_COMMENT)

### API v1.4.0
- Added: Notification Preferences API (2개 엔드포인트 - GET/PUT /notification-preferences/me)
- Changed: 섹션 번호 재정렬 (29개 섹션)

### Design v1.2.0
- No changes detected

### Tech v1.2.0
- No changes detected

---

## [2026-02-02] v1.1.0

### IA v1.1.0
- Changed: 루트 라우트 `/` → 인증 상태별 리다이렉트 (인증: /boards, 미인증: /login)
- Added: 랜딩 페이지 라우트 `/landing` (기존 `/`에서 이동)
- Added: Comment 도메인 모듈 (`domain/comment/`)
- Added: Notification 도메인 모듈 (`domain/notification/`)
- Changed: Backend 도메인 패키지 18개 → 20개
- Added: rds-simple Terraform 모듈
- Changed: 칸반 보드 탭 순서 (칸반 → 데일리 → 간트차트 → 마일스톤 → 관리)
- Changed: 마일스톤/관리 탭 Admin+ 전용으로 제한

### Wireframe v1.1.0
- Added: NotificationDropdown 컴포넌트 (알림 벨 + 읽지않은 수 뱃지, 알림/활동 탭)
- Added: CommentPanel 컴포넌트 (Task 상세 모달 내 댓글 패널, @ 멘션 지원)
- Changed: 칸반 보드 탭 순서 변경 (데일리 → 간트차트 → 마일스톤 → 관리)
- Changed: 마일스톤/관리 탭 Admin+ 전용 표시
- Changed: 랜딩 페이지 라우트 `/` → `/landing`

### ERD v1.1.0
- Added: Comment 테이블 (task_id, board_id, author_id, content, mentions)
- Added: Notification 테이블 (recipient_id, board_id, type, title, message + 인덱스 2개)
- Added: PricingPlan 테이블 (name, min/max_members, monthly/yearly_price)
- Changed: Role enum → BoardRole enum 리네이밍 (BoardMember, InviteLink)
- Added: Comment → Task/Board/User 관계
- Added: Notification → User/Board 관계

### API v1.1.0
- Added: Comment API (4개 엔드포인트 - GET/POST/PUT/DELETE)
- Added: Notification API (4개 엔드포인트 - 목록/읽지않은수/읽음처리/전체읽음)
- Added: Board Checklists API (2개 엔드포인트 - 보드 전체 조회/배치 조회)
- Added: Daily Checklists API (5개 엔드포인트 - Premium 전용)
- Added: Weight Levels API (4개 엔드포인트 - 보드 가중치/Task 가중치)
- Added: Admin API (10개 엔드포인트 - 사용자/보드/통계/구독 관리)
- Added: Test Data API (1개 엔드포인트 - 개발 환경 전용)
- Changed: Schedule API 확장 (4 → 8개 엔드포인트, with-checklist-item/settings/checklist-item 조회 추가)
- Changed: Schedule 경로 `/schedule` → `/schedules` 수정
- Added: 에러 코드 R001, A006~A018, U002~U003, SC001, CM001~CM002, DC001~DC002, N001, AD001, MS001~MS004, W001
- Changed: 에러 코드 전체 재정리 (ErrorCode.java 기반 40+ 코드)
- Changed: 섹션 번호 재정렬 (23개 섹션)

### Design v1.0.0
- No changes detected

### Tech v1.0.0
- No changes detected (rds-simple 모듈 추가는 IA에 반영)

---

## [2026-02-02] v1.0.0

### Initial Release (v1.0.0) - All Documents

#### IA v1.0.0
- Created: 프로젝트 전체 구조 (Frontend/Backend/Infrastructure)
- Created: Frontend 모듈 구성 (7개 모듈)
- Created: Backend 도메인 모듈 구성 (18개 도메인)
- Created: 페이지 라우트 구조 (14개 페이지)
- Created: 네비게이션 흐름 다이어그램
- Created: 권한 체계 (시스템 역할 + 보드 역할)

#### Wireframe v1.0.0
- Created: 랜딩 페이지 컴포넌트 계층
- Created: 로그인/회원가입 화면 구조
- Created: 대시보드 (보드 목록) 화면 구조
- Created: 칸반 보드 상세 화면 구조 (5개 뷰)
- Created: 모달 컴포넌트 목록 (15+ 모달)
- Created: Shadcn/Radix UI 컴포넌트 매핑 (50+)
- Created: 화면 간 이동 흐름 다이어그램

#### Design v1.0.0
- Created: BRIDGE 테마 컬러 팔레트 (Dark/Light)
- Created: Kanban 테마 컬러 (7개 변수)
- Created: Status/Text 컬러 정의
- Created: 타이포그래피 시스템
- Created: 컴포넌트 스타일 가이드 (카드, 버튼, 입력, 모달, 뱃지)
- Created: Glass Morphism 효과
- Created: 애니메이션 & 글로우 효과
- Created: 레이아웃 패턴 (테두리, 라운딩, 그림자)
- Created: 다크/라이트 모드 지원

#### ERD v1.0.0
- Created: Mermaid ER 다이어그램 (20+ 테이블)
- Created: User, Board, BoardMember 테이블 정의
- Created: Block, Feature, Task 테이블 정의
- Created: Tag, FeatureTag, TaskTag 테이블 정의
- Created: ChecklistItem, ScheduleBlock 테이블 정의
- Created: Milestone, MilestoneFeature, MilestoneAllocation 테이블 정의
- Created: Subscription, PaymentHistory 테이블 정의
- Created: InviteLink, ActivityLog, WeightLevel 테이블 정의
- Created: 인증 토큰 테이블 (RefreshToken, EmailVerification, PasswordReset)

#### API v1.0.0
- Created: 인증 API (10개 엔드포인트)
- Created: 사용자 API (4개 엔드포인트)
- Created: 보드 API (8개 엔드포인트)
- Created: 블록 API (5개 엔드포인트)
- Created: Feature API (6개 엔드포인트)
- Created: Task API (7개 엔드포인트)
- Created: 태그 API (4개 엔드포인트)
- Created: 체크리스트 API (5개 엔드포인트)
- Created: 멤버 API (4개 엔드포인트)
- Created: 초대 링크 API (5개 엔드포인트)
- Created: 마일스톤 API (10개 엔드포인트)
- Created: 스케줄 API (4개 엔드포인트)
- Created: 활동 로그 API (2개 엔드포인트)
- Created: 구독 API (5개 엔드포인트)
- Created: 통계 API (4개 엔드포인트)
- Created: 에러 코드 정의 (30+ 코드)

#### Tech v1.0.0
- Created: 아키텍처 개요 다이어그램
- Created: Frontend 기술 스택 (55+ 패키지)
- Created: Backend 기술 스택 (Spring Boot 3.4, Java 21)
- Created: AWS 인프라 구성
- Created: Terraform IaC 모듈 구조
- Created: CI/CD 파이프라인 (GitHub Actions)
- Created: 개발 환경 프로필 (local/dev/prod)
- Created: 환경 변수 정의
