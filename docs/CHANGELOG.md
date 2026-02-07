# Documentation Changelog

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
