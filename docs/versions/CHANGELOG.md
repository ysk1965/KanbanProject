# 버전 변경사항 요약 (v9.0 → v10.0)

## 주요 변경사항

### 신규 기능 (Major)

#### 1. Meeting 시스템 (v19, v22)
- **Meeting 엔티티 추가**: 회의 일정 관리
- **AI 회의록 정리**: MeetingAIService를 통한 자동 회의록 생성
- **음성 트랜스크립션**: MeetingTranscriptionService로 회의 음성 → 텍스트
- **필드 추가**:
  - `transcript` (TEXT): 회의록
  - `action_items` (JSON): AI 추출 액션 아이템
- **컴포넌트**:
  - `MeetingView`: 회의 관리 메인 뷰
  - `MeetingAISuggestionModal`: AI 제안 모달

#### 2. Baseline 날짜 (v21)
- **Task 필드 추가**:
  - `baseline_start_date` (LocalDate)
  - `baseline_due_date` (LocalDate)
- **기능**: Gantt 차트에서 계획 vs 실제 비교
- **API**:
  - `POST /tasks/save-baseline`: Baseline 저장
  - `DELETE /tasks/baseline`: Baseline 초기화

#### 3. Weekly Report 고도화 (v16)
- **ReportAIService 개선**: 더 정교한 AI 리포트 생성
- **미팅 연동**: 리포트에 미팅 정보 포함
- **팀/개인 리포트 구분**

#### 4. Admin 기능 확장
- **보드 상세 관리**: AdminBoardDetailModal
- **멤버 역할 변경**: Admin에서 멤버 역할 수정
- **초대 링크 생성**: Admin이 보드 초대 링크 생성
- **시스템 역할 관리**: SystemRole (USER/TESTER/ADMIN)

#### 5. Slack 연동 고도화 (v14)
- **브랜드별 분기**: BrandResolver를 통한 멀티 브랜드 지원
- **알림 타입 확장**: TASK_COMMENT 추가
- **웹훅 서비스 개선**: 에러 처리 강화

### 신규 기능 (Minor)

#### 6. 체크리스트/Task 이동 개선
- **체크리스트 이동**: `PUT /checklist/{itemId}/move-task`
- **Task 이동 개선**: Feature 간 이동 로직 강화

#### 7. 좌석 기반 구독 시스템
- **SeatPurchaseModal**: 좌석 구매 UI
- **좌석 과금**: 멤버 수 기반 요금 계산
- **API**:
  - `POST /subscription/seat`: 좌석 구매

#### 8. 멀티 브랜드 지원
- **Milkyway 도메인**: 도메인별 브랜딩 (favicon, og:image)
- **브랜드 분기**: 도메인별 기능 분기 (BrandResolver)

#### 9. 다국어 확장
- **신규 언어 (9개 추가)**:
  - 스페인어 (es)
  - 힌디어 (hi)
  - 일본어 (ja)
  - 포르투갈어 (pt-BR)
  - 태국어 (th)
  - 베트남어 (vi)
  - 중국어 간체 (zh)
  - 중국어 번체 (zh-TW)
- **총 지원 언어**: 11개 (한국어, 영어 포함)

#### 10. Daily Standup 기능
- **StandupConfigPanel**: 스탠드업 설정 UI
- **Daily Standup 구성**: 팀별 스탠드업 시간 설정

#### 11. 버전 정보 표시
- **로그인 페이지**: FE/BE 버전 표시
- **보드 페이지**: 우하단 버전 정보
- **설정**: `frontend/src/app/config.ts`에서 관리

### 변경 및 개선

#### 12. OAuth 개선
- **Google OAuth**: authorization code flow로 전환
- **에러 로깅**: 토큰 교환 실패 시 상세 에러 로그

#### 13. 알림 시스템 확장
- **NotificationType**: `TASK_COMMENT` 추가 (v20)
- **NotificationPreference**: 설정 항목 확장

#### 14. UI 개선
- **TrialBanner**: 디자인 및 카운트다운 개선
- **ScheduleDetailPanel**: 상세 정보 확장 (미팅 정보 포함)
- **PremiumBenefitsModal**: Premium 혜택 안내 모달
- **ComparisonPage**: 서비스 비교 페이지 (랜딩)

#### 15. 기타 개선
- **ActivityAction**: 액션 타입 추가 (BOARD_CREATED 등)
- **Board.getTaskLimit()**: 모든 티어 무제한 (null 반환)
- **Feature.priority**: 제거 (v15 - 사용하지 않는 필드)

---

## 문서 업데이트 대상

### Design 문서 (4개)
1. **overview.md**:
   - Meeting 시스템 추가
   - Admin 기능 확장
   - 다국어 지원 확장

2. **features.md**:
   - Meeting 기능 상세
   - Baseline 날짜 기능
   - 체크리스트/Task 이동 기능
   - Daily Standup 기능
   - 좌석 기반 구독

3. **ia.md**:
   - MeetingView 화면 추가
   - Admin 화면 확장
   - 새 모달 추가 (MeetingAISuggestionModal, PremiumBenefitsModal, SeatPurchaseModal)

4. **design-system.md**:
   - 새 컴포넌트 스타일 (MeetingView, StandupConfigPanel)

### Tech 문서 (3개)
1. **architecture.md**:
   - Meeting 도메인 추가
   - Standup 도메인 추가
   - 다국어 라이브러리 (react-i18next)

2. **backend.md**:
   - Meeting 엔티티
   - Task baseline 필드
   - NotificationType 확장
   - MeetingController API
   - MeetingAIService, MeetingTranscriptionService

3. **frontend.md**:
   - Meeting 타입
   - MeetingView 컴포넌트
   - 다국어 설정 (i18n)
   - 버전 정보 표시 로직

---

**문서 버전**: v10.0
**작성 기준일**: 2026년 2월 10일
**이전 버전**: v9.0 (2026년 1월 17일)
