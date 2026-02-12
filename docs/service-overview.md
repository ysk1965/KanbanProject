# BRIDGE - 서비스 기능 기획서

> **문서 버전**: v1.0.0
> **최종 수정**: 2026-02-12
> **목적**: 내부 정리용 - 현재 서비스 전체 기능 현황

---

## 1. 서비스 개요

**BRIDGE**는 소규모 팀(5~15명)을 위한 Feature-Task 연동 칸반보드 웹 애플리케이션이다.

### 핵심 컨셉
- **Feature → Task 계층 구조**: Feature(대형 기능)를 생성하고, 그 안에 Task(세부 작업)를 서브태스크로 관리
- **고정 블록 시스템**: Feature → Task → Done 3개 고정 블록 + 커스텀 블록 무제한 추가
- **자동 진행률**: Task가 Done 블록으로 이동하면 Feature 완료율 자동 반영
- **6가지 뷰 모드**: Kanban, Weekly(Gantt), Schedule(일일 타임블록), Notes, Statistics, AI Report

### 기술 스택
| 구분 | 기술 |
|------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Spring Boot 3.4, Java 21, PostgreSQL 15 |
| 인프라 | AWS (EB, RDS, S3, CloudFront, ElastiCache Redis) |
| 결제 | Toss Payments |
| AI | Claude API (claude-haiku-4-5), OpenAI (gpt-4o-mini) |
| 모니터링 | Sentry, Firebase Analytics, Spring Actuator |

---

## 2. 사용자 인증 및 계정

### 2.1 회원가입 / 로그인
- **이메일 회원가입**: 이메일 + 비밀번호 (최소 8자, 대문자/소문자/숫자/특수문자 포함)
- **Google OAuth 로그인**: Google 계정 원클릭 로그인
- **이메일 인증**: 가입 후 이메일 인증 필수, 재발송 가능
- **JWT 인증**: Access Token (1시간) + Refresh Token (7일, httpOnly Cookie)

### 2.2 비밀번호 관리
- **비밀번호 변경**: 현재 비밀번호 확인 후 새 비밀번호 설정
- **비밀번호 재설정**: 이메일로 재설정 링크 발송 (1시간 유효)

### 2.3 프로필 관리
- **프로필 수정**: 이름, 프로필 이미지 변경
- **테마 설정**: 다크/라이트 모드 선택
- **언어 설정**: ko-KR, en-US, ja-JP, zh-CN 지원 (브라우저 자동 감지)
- **계정 탈퇴**: 계정 영구 삭제

### 2.4 시스템 역할
| 역할 | 설명 |
|------|------|
| USER | 일반 사용자 |
| TESTER | 테스터 (과금 UI 숨김) |
| ADMIN | 시스템 관리자 (어드민 페이지 접근) |

---

## 3. 보드 관리

### 3.1 보드 CRUD
- **보드 생성**: 이름, 설명 입력 → 생성자가 자동으로 Owner
- **보드 수정**: 이름, 설명 변경 (Admin 이상)
- **보드 삭제**: Owner만 가능 (하위 모든 데이터 cascade 삭제)
- **보드 즐겨찾기**: 별표 토글로 즐겨찾기 관리

### 3.2 보드 목록 (Dashboard)
- 참여 중인 보드 목록 표시
- 보드 검색
- 즐겨찾기 보드 상단 고정
- 보드 카드: 이름, 설명, 멤버 미리보기, 역할 표시

### 3.3 보드 설정
- **작업 시간**: 일일 근무 시간 (기본 8시간)
- **근무 시작 시간**: 스케줄 뷰 기본 시작 시간
- **점심 시간**: 시작/종료 시간 설정
- **스케줄 표시 모드**: TIME / BLOCK

---

## 4. 역할 및 권한 체계

### 4.1 보드 역할
```
Owner > Admin > Member > Viewer
```

| 기능 | Owner | Admin | Member | Viewer |
|------|:-----:|:-----:|:------:|:------:|
| 보드 삭제 | O | - | - | - |
| 보드 수정 | O | O | - | - |
| 멤버 초대/강퇴 | O | O | - | - |
| 역할 변경 | O | O | - | - |
| 블록 생성/수정/삭제 | O | O | - | - |
| Feature 생성/수정/삭제 | O | O | O | - |
| Task 생성/수정/이동/삭제 | O | O | O | - |
| 댓글 작성/반응 | O | O | O | - |
| 체크리스트 관리 | O | O | O | - |
| 스케줄 블록 관리 | O | O | O | - |
| 읽기/조회 | O | O | O | O |
| 결제/구독 관리 | O | - | - | - |
| 마일스톤 관리 | O | O | - | - |
| 태그 관리 | O | O | O | - |

### 4.2 멤버 관리
- **직접 초대**: 이메일 입력으로 초대 (가입된 유저 즉시 추가, 미가입 유저 이메일 발송)
- **초대 링크**: 코드 기반 초대 (역할 지정, 만료일, 최대 사용 횟수 설정)
- **역할 변경**: Admin 이상이 Member/Viewer의 역할 변경 가능
- **멤버 강퇴**: Admin 이상이 Member 이하 강퇴 가능
- **멤버 순서**: 드래그로 표시 순서 변경
- **담당자 색상**: 멤버별 고유 색상 지정 (indigo, purple, teal, rose, amber, emerald)

---

## 5. 칸반보드 (Kanban View)

### 5.1 블록 시스템

#### 고정 블록 (삭제/이름변경 불가)
| 순서 | 블록 | 역할 |
|------|------|------|
| 1 | **Feature** | Feature 카드가 위치하는 최초 블록 |
| 2 | **Task** | Task가 처음 생성되는 기본 블록 |
| 마지막 | **Done** | 완료된 Task가 이동하는 최종 블록 |

#### 커스텀 블록
- Task와 Done 사이에 무제한 추가 가능
- 이름, 색상 커스터마이징
- 드래그로 순서 변경
- 삭제 가능

### 5.2 Feature (기능 카드)
- **생성**: Feature 블록에서만 생성 가능
- **필드**: 제목, 설명, 색상(좌측 바), 담당자, 마감일
- **상태**: ACTIVE / COMPLETED
- **진행률**: 서브 Task 완료 비율 자동 계산
- **자동 완료**: 모든 서브 Task 완료 시 자동으로 COMPLETED 전환
- **태그**: 복수 태그 지정 가능
- **마일스톤 연결**: 마일스톤에 할당 가능

### 5.3 Task (작업 카드)
- **생성**: Feature 내부에서 서브태스크로만 생성
- **필드**: 제목, 설명, 시작일, 마감일, 예상 소요시간(분)
- **블록 이동**: 드래그앤드롭으로 블록 간 이동
  - Done 블록 이동 시 → 자동 완료 처리 (isCompleted=true)
  - Done에서 다른 블록 이동 시 → 완료 해제 (isCompleted=false)
- **Feature 이동**: 다른 Feature로 Task 이전 가능 (양쪽 Feature의 카운트 자동 조정)
- **재정렬**: 블록 내 드래그로 순서 변경
- **태그**: 복수 태그 지정 가능
- **가중치**: 가중치 레벨 할당 (스토리포인트)

### 5.4 체크리스트 (Checklist)
- Task 내 서브항목으로 관리
- **항목별 기능**:
  - 제목 편집
  - 완료 토글
  - 개별 담당자 할당
  - 시작일/마감일 설정
  - 드래그로 순서 변경
  - 다른 Task로 이동
- **배치 로딩**: 카드 펼침 시 배치로 체크리스트 로드 (성능 최적화)

### 5.5 태그 시스템
- 보드 단위 태그 관리 (이름, 색상)
- Feature와 Task 모두에 태그 지정 가능
- 태그 기반 필터링

### 5.6 필터링
- Feature별 필터
- 태그별 필터
- 멤버별 필터
- 상태별 필터 (완료/미완료)
- 마일스톤별 필터

### 5.7 드래그앤드롭
- **@dnd-kit 기반** 구현
- Task 카드: 블록 간 이동, 블록 내 재정렬
- 블록: 좌우 순서 이동 (고정 블록 제외)
- 체크리스트 아이템: Task 내 순서 변경
- 멤버 순서: ShareBoardModal 내 드래그 정렬

---

## 6. 주간 스케줄 (Weekly View - Gantt Chart)

### 6.1 Gantt 차트
- Feature/Task의 시작일~마감일을 막대로 시각화
- 주 단위 타임라인 표시
- 날짜 범위 네비게이션

### 6.2 일정 조정
- 드래그로 Task 일정 변경 (시작일/마감일)
- 색상 코딩: 완료(초록), 마감 초과(빨강), 마감 임박(주황)

### 6.3 Baseline (기준선)
- 현재 일정을 Baseline으로 저장
- 실제 일정과 기준선 비교 시각화
- Baseline 초기화 가능

---

## 7. 일일 스케줄 (Schedule View)

### 7.1 타임블록 스케줄
- **30분 단위** 시간 슬롯
- 멤버별 컬럼 레이아웃
- 드래그로 시간 블록 생성
- 블록 클릭 시 상세 패널 표시

### 7.2 스케줄 블록
- 체크리스트 항목과 연결 (선택적)
- 회의와 연결 (선택적)
- 시작 시간 / 종료 시간 설정
- 점심 시간 분할 리사이즈 지원

### 7.3 뷰 모드
- **일(Day) 뷰**: 단일 날짜의 멤버별 스케줄
- **주(Week) 뷰**: 주간 스케줄 개요
- 날짜 네비게이션 (이전/다음/오늘)

### 7.4 일일 요약 / 주간 요약
- 일일 요약 모달: 해당 날짜 스케줄 종합
- 주간 요약 모달: 주간 스케줄 종합

### 7.5 스케줄 설정
- 표시 시간 범위 설정
- 색상 설정
- 근무 시작/종료 시간
- 점심 시간 설정

---

## 8. 일일 체크리스트 (Daily Checklist)

### 8.1 멤버별 컬럼
- 각 멤버별로 독립된 체크리스트 컬럼
- 날짜 선택으로 특정 날짜의 체크리스트 조회

### 8.2 항목 관리
- 기존 체크리스트 항목을 일일 체크리스트에 추가
- 새 체크리스트 항목 직접 생성 및 추가
- 완료 토글
- 순서 변경
- 삭제 (일일 체크리스트에서만 제거, 원본 유지)

### 8.3 원본 연동
- 체크리스트 항목과 연결 유지
- 원본 삭제 시 연결 해제 (제목 백업으로 표시 유지)

---

## 9. 마일스톤

### 9.1 마일스톤 CRUD
- **생성**: 제목, 설명, 시작일, 종료일 설정 (Admin 이상)
- **수정/삭제**: Admin 이상
- **기본 작업 시간**: 마일스톤별 일일 기본 작업 시간 설정

### 9.2 Feature 연결
- 마일스톤에 복수 Feature 할당
- Feature를 마일스톤에 추가/제거
- 마일스톤별 진행률 자동 계산 (연결된 Feature의 Task 완료율)

### 9.3 시간 할당 (Allocation)
- 마일스톤별 멤버 작업 시간 할당 관리
- 멤버별 working_days, total_allocated_hours 설정
- 리소스 관리 용도

### 9.4 보드 선택 마일스톤
- 보드에서 주요 마일스톤 1개 선택 가능
- 선택된 마일스톤 기준으로 칸반보드 필터링

---

## 10. 댓글 시스템

### 10.1 Task 댓글
- Task 상세 모달 내 CommentPanel
- 댓글 작성/수정/삭제
- 페이지네이션 지원

### 10.2 @멘션
- 댓글 내 @멘션으로 특정 사용자 태그
- 멘션 시 인앱 알림 + Slack 알림 (설정에 따라)
- 멘션된 댓글 별도 조회 가능

### 10.3 첨부파일
- 댓글당 최대 5개 첨부
- 지원 형식: JPEG, PNG, GIF, WebP, MP4, WebM, QuickTime
- 파일 크기: 이미지 최대 55MB, 비디오 최대 50MB
- S3 저장 + 썸네일 자동 생성 (400x400px)
- 비디오 Lightbox 뷰어 지원

### 10.4 이모지 반응
- 댓글에 이모지 반응 추가/제거
- 기본 이모지 + 커스텀 이모지 지원
- 동일 이모지 중복 방지 (사용자별 1회)

### 10.5 커스텀 이모지
- 보드별 커스텀 이모지 업로드 (Admin 이상)
- 이미지 업로드 → S3 저장
- 댓글 반응에서 사용 가능

---

## 11. 노트/문서 (Notes View)

### 11.1 폴더/문서 트리
- 폴더와 문서의 계층 구조 (최대 4단계 depth)
- 트리 사이드바 네비게이션
- 리스트 뷰 전환 가능

### 11.2 문서 편집
- **Tiptap** 기반 Rich Text 편집기
- 편집 툴바: 서식, 목록, 테이블, 코드블록 등
- 테이블 버블 메뉴

### 11.3 버전 관리
- 수정 시 자동 버전 생성
- 버전 히스토리 조회
- 이전 버전으로 복구 가능

### 11.4 노트 태그
- 노트 전용 태그 시스템 (보드 태그와 별도)
- 태그 생성/삭제
- 태그 기반 필터링

### 11.5 AI 도우미
- 노트 내용 AI 자동 정리 제안
- AI 제안 미리보기 후 적용/거부

### 11.6 문서 이동
- 폴더 간 문서 이동
- Soft delete (휴지통 개념)

---

## 12. 회의 관리 (Meeting)

### 12.1 회의 CRUD
- 제목, 날짜, 시작/종료 시간, 메모, 색상 설정
- 날짜별 회의 목록 조회
- 수정/삭제 (생성자 또는 Admin 이상)

### 12.2 스케줄 연동
- 회의를 스케줄 블록으로 자동 연결
- 참석자 자동 추적 (ScheduleBlock 기반)

### 12.3 음성 전사 (Transcript)
- 음성 파일 업로드 → STT(Speech-to-Text) 변환
- 전사 텍스트 수동 편집 가능

### 12.4 AI 회의록 정리
- 전사 텍스트 기반 AI 자동 정리 제안
- 제안 미리보기 후 적용
- 정리된 회의록을 노트로 저장

### 12.5 참가자 알림
- 회의 참가자에게 알림 발송

---

## 13. 통계 및 분석 (Statistics View)

### 13.1 보드 통계
- Feature 수 / Task 수 / 완료율
- 댓글 수 / 활동량
- 기간별 추이 차트 (선, 막대, 파이)

### 13.2 개인 통계
- 내 완료 Task 수
- 평균 처리 시간
- 활동 추이

### 13.3 관리 대시보드 (Admin 이상)
- 마일스톤 헬스 현황
- 팀원별 생산성 비교
- 지연 항목 목록

### 13.4 필터링
- 기간 필터 (주/월/커스텀)
- 마일스톤 필터
- Feature 필터
- 멤버 필터
- 태그 필터

### 13.5 가중치 설정 (Weight Level)
- 보드별 가중치 레벨 정의 (예: Small=1, Medium=3, Large=5)
- 이름, 무게값, 색상, 기본값 설정
- Task에 가중치 할당 → 통계에 반영

---

## 14. AI 리포트 (AI Report View)

### 14.1 리포트 유형
| 유형 | 내용 | 대상 |
|------|------|------|
| 주간 리포트 | 전체 Feature 진행률, 완료 Task, 활동 요약 | 보드 전체 |
| 팀 리포트 | 팀원별 활동량, 성과 비교 | 보드 전체 |
| 개인 리포트 | 해당 멤버의 댓글, 체크리스트, 스케줄 활동 | 특정 멤버 |

### 14.2 생성 방식
- Claude API (claude-haiku-4-5) 또는 OpenAI (gpt-4o-mini) 활용
- 활동 로그, 통계 데이터 기반 자동 생성
- Markdown 형식 렌더링

### 14.3 관리
- 리포트 히스토리 목록
- 재생성 가능
- 클립보드 복사

---

## 15. 일일 스탠드업 (Daily Standup)

### 15.1 자동 발송
- 매일 정해진 시간에 스탠드업 메시지 자동 발송
- UTC 기반 시간 설정 + 타임존 표시

### 15.2 설정
- 활성화/비활성화 토글
- 발송 시간 설정
- 타임존 선택
- 언어 선택 (ko/en/ja/zh)

### 15.3 Slack 연동
- 설정된 Slack 웹훅으로 스탠드업 발송
- 멤버별 전일 활동 요약 포함

---

## 16. 알림 시스템

### 16.1 인앱 알림
- 알림 드롭다운으로 실시간 확인
- 미읽은 알림 카운트 배지
- 개별/전체 읽음 처리

### 16.2 알림 유형
| 유형 | 트리거 |
|------|--------|
| COMMENT_MENTION | 댓글에서 @멘션됨 |
| CHECKLIST_ASSIGNED | 체크리스트 항목에 담당자로 할당됨 |
| TASK_COMMENT | 관련 Task에 새 댓글 |
| MEETING_MEMO_SHARED | 회의 메모 공유됨 |

### 16.3 알림 설정
- 알림 유형별 인앱/Slack 개별 토글
- 보드별 알림 설정 관리

---

## 17. Slack 통합

### 17.1 개인별 웹훅 설정
- 멤버 각자가 Slack Webhook URL 설정
- 채널명 지정
- 활성화/비활성화 토글
- 테스트 발송 기능

### 17.2 Slack 알림 발송
- 댓글 멘션 알림 (비동기 발송)
- 체크리스트 할당 알림
- 회의 메모 공유 알림
- 일일 스탠드업 발송

### 17.3 알림 필터
- NotificationPreference의 Slack 토글에 따라 발송 여부 결정
- 인앱 알림과 독립적으로 관리

---

## 18. 구독 및 결제

### 18.1 요금 체계

#### 무료 사용 조건
- Billable 멤버(Owner + Admin + Member) 3명 이하 → 무료
- Viewer는 과금 대상 아님

#### 유료 플랜
| 구분 | 월간(Monthly) | 연간(Yearly) |
|------|:---:|:---:|
| 좌석당 가격 | 500원/seat | 5,000원/seat |

### 18.2 구독 상태 흐름
```
TRIAL (3일) → ACTIVE (결제 성공)
                ↓ (결제 실패)
              GRACE (3일 유예)
                ↓ (유예 만료)
              SUSPENDED (읽기 전용)
                ↓ (재결제)
              ACTIVE
                ↓ (취소)
              CANCELED
```

### 18.3 결제 기능
- **Toss Payments** 연동
- 구독 시작 (Owner만)
- 플랜 변경
- 추가 좌석 구매
- 구독 취소

### 18.4 Trial 배너
- Trial 남은 일수 카운트다운 배너
- 업그레이드 유도 모달 (Premium 혜택 소개)

---

## 19. 활동 로그

### 19.1 추적 대상
| 대상 | 액션 |
|------|------|
| Board | 생성, 수정 |
| Block | 생성, 수정, 삭제, 순서변경 |
| Feature | 생성, 수정, 삭제, 완료 |
| Task | 생성, 수정, 삭제, 이동, 완료, 재개, Feature 이동 |
| Checklist | 생성, 체크, 이동 |
| Member | 초대, 가입, 역할변경, 제거, 탈퇴 |
| Tag | 생성, 삭제 |
| Subscription | 시작, 취소, 플랜변경 |

### 19.2 조회
- 커서 기반 페이지네이션
- 시간대별 활동 조회
- AI 리포트 데이터 소스로 활용

### 19.3 자동 정리
- 6개월 이상 활동 로그 자동 삭제 (스케줄러)

---

## 20. 파일 관리

### 20.1 업로드 방식
- **Local 모드**: 로컬 디렉토리 저장 (개발용)
- **S3 모드**: AWS S3 버킷 저장 (운영)
- Presigned URL 기반 직접 업로드 지원

### 20.2 제한사항
- 최대 파일 크기: 55MB
- 최대 요청 크기: 110MB
- 허용 타입: JPEG, PNG, GIF, WebP, MP4, WebM, QuickTime
- 썸네일 자동 생성: 400x400px

---

## 21. 고객 문의 (Inquiry)

### 21.1 사용자 측
- 문의 작성 (제목, 내용, 첨부파일)
- 내 문의 목록 조회
- 문의 상세 및 답변 확인
- 추가 답변 작성
- 미읽은 답변 수 배지

### 21.2 문의 상태 흐름
```
PENDING → IN_PROGRESS → RESOLVED → CLOSED
```

### 21.3 관리자 측
- 문의 목록 조회 (페이징, 상태 필터)
- 답변 작성
- 상태 변경

---

## 22. 시스템 관리 (Admin Page)

### 22.1 관리자 대시보드
| 탭 | 기능 |
|------|------|
| Dashboard | 전체 통계 (사용자 수, 보드 수, 구독 수) |
| Analytics | 가입 추세, 활성 사용자, 전환율 통계 |
| Users | 사용자 관리 (조회, 수정, 활성화/비활성화, 삭제) |
| Boards | 보드 관리 (조회, 삭제, 티어 변경, 소유권 이전) |
| Subscriptions | 구독 정보 조회 및 관리 |
| Announcements | 공지사항 CRUD (NOTICE/BANNER/POPUP) |
| System | 유지보수 모드 설정 |
| Inquiries | 고객 문의 관리 및 답변 |

### 22.2 관리 기능 상세
- **사용자 관리**: 프로필 수정, 이메일 수동 인증, 비밀번호 재설정 발송, 비활성화/활성화, 영구 삭제
- **보드 관리**: 보드 삭제, 티어 변경 (TRIAL/STANDARD/PREMIUM), Trial 기간 연장, 소유권 이전, 좌석 수 수정, 멤버 역할 변경
- **공지사항**: 유형(NOTICE/BANNER/POPUP), 활성 여부, 노출 기간, 우선순위, 대상 역할

### 22.3 시스템 상태
- 유지보수 모드 온/오프
- 시스템 상태 API (/api/v1/system/status)
- 활성 공지사항 표시

---

## 23. 랜딩 페이지

### 23.1 구성 요소
- **Hero Scene**: Three.js 기반 3D 애니메이션
- **기능 소개 카드**: Feature 그리드
- **인터랙티브 다이어그램**: Kanban, Gantt, DailySchedule, Checklist, Slack, AI Report 시연
- **가격 비교표**: 플랜별 기능 비교
- **CTA 버튼**: 회원가입 유도

### 23.2 경쟁사 비교 페이지
- /compare 경로
- 타 서비스와의 기능 비교표

### 23.3 법률 페이지
- 서비스 약관 (/terms)
- 개인정보 처리방침 (/privacy)

---

## 24. 온보딩 및 가이드

### 24.1 빈 보드 가이드
- 새 보드 생성 시 온보딩 가이드 표시
- 단계별 사용법 안내

### 24.2 마일스톤 온보딩
- 첫 마일스톤 사용 시 가이드 모달

### 24.3 Slack 연동 가이드
- Slack Webhook 설정 단계별 안내 모달

---

## 25. 디자인 시스템

### 25.1 테마
- **다크 모드** (기본): Bridge Dark (#0A0E17) 배경
- **라이트 모드**: 지원

### 25.2 컬러 팔레트
| 이름 | HEX | 용도 |
|------|-----|------|
| Bridge Dark | #0A0E17 | 메인 배경 |
| Bridge Obsidian | #0F1419 | 카드/헤더 배경 |
| Bridge Accent | #6366F1 | 주요 액센트 (인디고) |
| Bridge Secondary | #2DD4BF | 보조 액센트 (틸) |

### 25.3 담당자 색상 (6색)
indigo, purple, teal, rose, amber, emerald

### 25.4 컴포넌트
- **UI 프레임워크**: shadcn/ui (Radix UI 기반)
- **아이콘**: Lucide React
- **차트**: Recharts
- **애니메이션**: Framer Motion
- **Glass Morphism**: backdrop-blur 효과

### 25.5 다국어 지원
- **i18next** 기반
- 지원 언어: 한국어, 영어, 일본어, 중국어
- 브라우저 언어 자동 감지

### 25.6 타임존 처리
- **저장**: UTC (서버/DB)
- **API 응답**: ISO 8601 + 'Z' suffix
- **표시**: 클라이언트 브라우저 타임존으로 자동 변환

---

## 26. 데이터 모델 (요약)

### 26.1 핵심 계층 구조
```
User
  └─ Board (Owner/Member)
       ├─ Block (FEATURE, TASK, DONE + Custom)
       ├─ Feature
       │    ├─ Task
       │    │    ├─ ChecklistItem
       │    │    │    ├─ ScheduleBlock
       │    │    │    └─ DailyChecklist
       │    │    ├─ Comment
       │    │    │    ├─ CommentAttachment
       │    │    │    └─ CommentReaction
       │    │    └─ TaskWeight
       │    └─ Tag (N:N via FeatureTag)
       ├─ Milestone
       │    ├─ MilestoneFeature (N:N)
       │    └─ MilestoneAllocation
       ├─ Note (folder/document tree)
       │    ├─ NoteVersion
       │    └─ NoteTag (N:N via NoteTagMapping)
       ├─ Meeting
       ├─ BoardMember
       ├─ Subscription
       │    ├─ PaymentHistory
       │    └─ PricingPlan
       ├─ MemberSlackWebhook
       ├─ DailyStandupConfig
       ├─ BoardCustomEmoji
       ├─ Notification
       ├─ NotificationPreference
       ├─ ActivityLog
       ├─ InviteLink
       ├─ WeeklyReport
       └─ WeightLevel
```

### 26.2 테이블 수
- **총 40+ 테이블** (V28 마이그레이션 기준)

### 26.3 특성
- 모든 ID: UUID 기반
- 타임존: UTC 저장
- JSON 필드: metadata, aiSuggestions, dataSnapshot
- Soft Delete: Note (isDeleted)

---

## 27. API 현황

### 27.1 규모
- **총 250+ 엔드포인트**
- **33개 Controller**

### 27.2 도메인별 분포
| 도메인 | 엔드포인트 수 (약) |
|--------|:---:|
| 인증 & 사용자 | 14 |
| 보드 관리 | 10 |
| 블록 관리 | 5 |
| Feature 관리 | 6 |
| Task 관리 | 10 |
| 태그 관리 | 8 |
| 체크리스트 관리 | 9 |
| 댓글 관리 | 8 |
| 마일스톤 관리 | 11 |
| 멤버 관리 | 6 |
| 초대 링크 | 5 |
| 일정 관리 | 11 |
| 일일 체크리스트 | 5 |
| 가중치 | 4 |
| 활동 로그 | 1 |
| 알림 | 6 |
| 통계 | 3 |
| 파일 | 2 |
| 커스텀 이모지 | 3 |
| Slack 연동 | 5 |
| 구독 & 결제 | 8 |
| 리포트 | 4 |
| 회의 관리 | 11 |
| 노트 관리 | 14 |
| 스탠드업 설정 | 2 |
| 고객 문의 | 5 |
| 관리자 | ~40 |
| 시스템 | 2 |

### 27.3 통합 API (성능 최적화)
- `/boards/{boardId}/full` - 보드 진입 시 13개 API를 1개로 통합
- `/schedules/weekly` - 주간 일정 7개 API를 1개로 통합
- `/schedules/daily-full` - Day 모드 2개 API를 1개로 통합
- `/checklist-items/batch` - 체크리스트 배치 조회 (N+1 해결)

---

## 28. 인프라 구성

### 28.1 환경별 구성
| 구분 | Local | Dev | Prod |
|------|-------|-----|------|
| DB | H2 In-Memory | PostgreSQL 15 | Aurora Serverless v2 |
| Cache | Simple | Simple | Redis 7 (ElastiCache) |
| File | 로컬 디렉토리 | S3 | S3 + CloudFront CDN |
| JPA ddl-auto | update | update | validate |
| 배포 | 수동 | 수동 | Elastic Beanstalk |

### 28.2 AWS 아키텍처
```
Route 53 (DNS)
  ├─ CloudFront → S3 (Frontend 정적 파일)
  └─ ALB → Elastic Beanstalk (Backend)
              ├─ RDS PostgreSQL / Aurora Serverless v2
              └─ ElastiCache Redis
ACM (SSL) + SES (이메일) + Sentry (에러 추적)
```

### 28.3 Docker
- 멀티 스테이지 빌드 (JDK → JRE)
- 비루트 사용자 실행
- JVM MaxRAMPercentage=75.0

---

## 부록: 페이지 라우팅 맵

| 경로 | 페이지 | 인증 |
|------|--------|------|
| `/` | 랜딩 페이지 | Public |
| `/compare` | 경쟁사 비교 | Public |
| `/login` | 로그인/회원가입 | Public |
| `/verify-email` | 이메일 인증 결과 | Public |
| `/email-pending` | 이메일 인증 대기 | Public |
| `/forgot-password` | 비밀번호 재설정 요청 | Public |
| `/reset-password` | 비밀번호 재설정 | Public |
| `/terms` | 서비스 약관 | Public |
| `/privacy` | 개인정보 처리방침 | Public |
| `/maintenance` | 점검 중 | Public |
| `/boards` | 대시보드 (보드 목록) | User |
| `/boards/:boardId` | 칸반보드 (6개 뷰) | Board.Viewer+ |
| `/invite/:inviteCode` | 초대 랜딩 | Public/User |
| `/settings` | 사용자 설정 | User |
| `/announcements` | 공지사항 | User |
| `/payment-success` | 결제 성공 | User |
| `/payment-fail` | 결제 실패 | User |
| `/admin/*` | 관리자 대시보드 | Admin |
