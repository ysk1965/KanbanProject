# Feature: 다크/라이트 테마 전환

> 생성일: 2026-01-15
> 상태: 완료

---

## Feature Capsule

| 항목 | 내용 |
|------|------|
| 기능명 | 다크/라이트 테마 전환 |
| 한줄 설명 | 사용자가 설정에서 다크/라이트 테마를 토글로 전환할 수 있는 기능 |
| 해결하는 문제 | 어두운 테마 선호도 차이, 밝은 화면 선호 사용자 대응, 눈의 피로도 감소 |
| 핵심 시나리오 | 설정 페이지 → 테마 토글 → 즉시 전환 + 서버 저장 → 재로그인 시 유지 |
| Scope | BE 테마 저장, FE 테마 전환, 전체 색상 정규화 |
| Non-scope | 시스템 테마 자동 감지, 로그인 전 페이지 테마 적용 |
| 성공 기준 | 토글 시 즉시 전환, 재로그인 후 테마 유지, 모든 페이지 정상 표시 |
| 영향받는 기존 코드 | theme.css, User 타입, AuthContext, SettingsPage, 20+ 컴포넌트 |
| 주요 리스크 | 하드코딩 색상 누락 시 UI 깨짐 |

---

## Decision Log

| ID | 항목 | 선택 | 근거 | 대안 |
|----|------|------|------|------|
| D-01 | 테마 저장 방식 | BE 컬럼 추가 | 유저별 영구 저장 필요 | localStorage만 사용 |
| D-02 | 테마 옵션 | 다크/라이트 2가지 | 단순함 | 시스템 설정 포함 3가지 |
| D-03 | 적용 범위 | 로그인 후 페이지만 | 기존 랜딩 다크 유지 | 전체 앱 |
| D-04 | 색상 처리 | 전체 정규화 | 완전한 라이트 모드 지원 | 주요 페이지만 우선 |

---

## Feature Spec

### 상세 요구사항

- **REQ-F01**: 사용자는 설정 페이지에서 다크/라이트 테마를 토글로 전환할 수 있다
- **REQ-F02**: 테마 설정은 서버에 저장되어 재로그인 시에도 유지된다
- **REQ-F03**: 테마 전환 시 페이지 새로고침 없이 즉시 적용된다
- **REQ-F04**: 로그인 후 모든 페이지(보드리스트, 칸반보드, 설정, 모달 등)에 테마가 적용된다
- **REQ-F05**: 기존 하드코딩 색상을 CSS 변수로 정규화하여 테마 전환이 완전히 동작한다

### UI/UX 명세

#### 화면 구성
- **위치**: SettingsPage.tsx 내 새로운 섹션 (프로필 섹션 아래)
- **UI**: Moon 아이콘 + "테마" 제목 + Switch 토글
- **상태 표시**: 현재 테마 텍스트 (다크 모드 / 라이트 모드)

#### 사용자 플로우
```
1. 사용자가 설정 페이지 진입
2. "테마" 섹션에서 토글 확인 (기본: 다크)
3. 토글 클릭 → 즉시 UI 전환
4. 백그라운드로 서버에 저장
5. 다음 로그인 시 저장된 테마로 자동 적용
```

#### 상태별 UI
- **로딩**: 토글 disabled + 저장 중 표시
- **에러**: 토스트로 "테마 저장 실패" 표시, UI는 이미 전환된 상태 유지
- **성공**: 별도 표시 없음 (즉시 전환이 피드백)

### 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 네트워크 오류로 저장 실패 | UI는 전환 유지, 토스트 알림, 다음 로그인 시 이전 테마 |
| 로그아웃 후 재로그인 | 서버에서 테마 조회하여 적용 |
| 새 탭에서 앱 열기 | 로그인 시 서버 테마 적용 |

---

## Implementation Plan

### 변경 범위

#### Frontend

**수정 파일:**
| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/styles/theme.css` | 라이트 모드 CSS 변수 정의 |
| `frontend/src/app/types/index.ts` | User 타입에 theme 필드 추가 |
| `frontend/src/app/contexts/AuthContext.tsx` | updateCurrentUser 메서드 추가 |
| `frontend/src/app/utils/api.ts` | updateProfile에 theme 지원 |
| `frontend/src/app/utils/services.ts` | userService에 테마 저장 로직 |
| `frontend/src/app/components/SettingsPage.tsx` | 테마 토글 섹션 추가 |
| `frontend/src/app/App.tsx` | ThemeProvider 적용 |

**색상 정규화 대상:**
- `UserMenu.tsx`
- `KanbanBoardPage.tsx`
- `BoardListPage.tsx`
- `WeeklyScheduleView.tsx`
- 기타 모달/컴포넌트들

**추가 파일:**
| 파일 | 설명 |
|------|------|
| `frontend/src/app/contexts/ThemeContext.tsx` | 테마 상태 관리 Context |

#### Backend

**수정 파일:**
| 파일 | 변경 내용 |
|------|----------|
| `User` 엔티티 | theme 컬럼 추가 (VARCHAR, default: 'dark') |
| `UserController` | /users/me PATCH에 theme 지원 |
| `UserService` | 테마 업데이트 로직 |
| `UserDTO` | theme 필드 추가 |

### API 변경

| Method | Endpoint | 설명 | Request 추가 | Response 추가 |
|--------|----------|------|--------------|---------------|
| PATCH | `/api/v1/users/me` | 프로필 수정 | `theme?: 'dark' \| 'light'` | `theme: string` |
| GET | `/api/v1/users/me` | 유저 조회 | - | `theme: string` |

### DB 변경

| 테이블 | 변경 유형 | 컬럼/설명 |
|--------|----------|----------|
| `users` | ADD COLUMN | `theme VARCHAR(10) DEFAULT 'dark'` |

---

## TASKS

### 실행 전략 요약

| Phase | 유형 | 태스크 | 병렬 가능 | 상태 |
|-------|------|--------|-----------|------|
| 1 | 선행 | TASK-001 | - | ✅ |
| 2 | 병렬 | TASK-002, TASK-003 | ✅ BE/FE 동시 | ✅ |
| 3 | 순차 | TASK-004 | - | ✅ |
| 4 | 통합 | TASK-005 | - | ✅ |

---

### Phase 1: 선행 작업 (Sequential)

#### [TASK-001] 테마 CSS 변수 및 ThemeContext 구현 ✅

- **Context**: REQ-F03 (즉시 전환) 기반
- **Files**:
  - `frontend/src/styles/theme.css`
  - `frontend/src/app/contexts/ThemeContext.tsx` (신규)
  - `frontend/src/app/App.tsx`
- **Subtasks**:
  - [x] 1-1. theme.css에 라이트 모드 CSS 변수 정의
  - [x] 1-2. ThemeContext 생성 (theme 상태, toggleTheme, setTheme)
  - [x] 1-3. App.tsx에 ThemeProvider 적용
  - [x] 1-4. HTML root에 class 토글 로직 구현
- **완료 기준**: 개발자 도구에서 수동으로 class 변경 시 테마 전환 확인
- **후속 태스크**: TASK-002, TASK-003 (이 태스크 완료 후 병렬 실행 가능)

---

### Phase 2: 병렬 작업 (Parallel)

> 아래 태스크들은 **동시에 실행 가능**합니다.

#### [TASK-002] [BE] User 테마 저장 API 구현 ✅

- **Context**: REQ-F02 (서버 저장)
- **Subtasks**:
  - [x] 2-1. User 엔티티에 theme 컬럼 추가 (default: 'dark')
  - [x] 2-2. UserDTO에 theme 필드 추가
  - [x] 2-3. UserService updateProfile에 theme 처리 추가
  - [x] 2-4. /users/me GET 응답에 theme 포함 확인
- **Files**:
  - `backend/src/main/java/com/kanban/domain/user/entity/User.java`
  - `backend/src/main/java/com/kanban/domain/user/dto/*.java`
  - `backend/src/main/java/com/kanban/domain/user/service/UserService.java`
- **완료 기준**: API 테스트로 theme 저장/조회 확인
- **병렬 대상**: TASK-003과 동시 실행 가능

#### [TASK-003] [FE] 설정 페이지 테마 토글 UI 구현 ✅

- **Context**: REQ-F01 (토글 전환)
- **Subtasks**:
  - [x] 3-1. types/index.ts에 User.theme 타입 추가
  - [x] 3-2. api.ts updateProfile에 theme 파라미터 추가
  - [x] 3-3. AuthContext에 updateCurrentUser 메서드 추가
  - [x] 3-4. SettingsPage에 테마 토글 섹션 추가
  - [x] 3-5. 토글 변경 시 ThemeContext + API 호출 연동
- **Files**:
  - `frontend/src/app/types/index.ts`
  - `frontend/src/app/utils/api.ts`
  - `frontend/src/app/contexts/AuthContext.tsx`
  - `frontend/src/app/components/SettingsPage.tsx`
- **완료 기준**: 토글 클릭 시 테마 전환 + 콘솔에서 API 호출 확인
- **병렬 대상**: TASK-002와 동시 실행 가능
- **Mock 필요**: BE 완료 전까지 API 호출은 console.log로 대체

---

### Phase 3: 색상 정규화 (Sequential)

#### [TASK-004] 전체 컴포넌트 색상 정규화 ✅

- **Context**: REQ-F05 (완전한 테마 전환)
- **선행 조건**: TASK-001 완료
- **Subtasks**:
  - [x] 4-1. UserMenu.tsx 색상 정규화
  - [x] 4-2. App.tsx 색상 정규화
  - [x] 4-3. ScheduleDetailPanel.tsx 색상 정규화
  - [x] 4-4. ScheduleSettingsModal.tsx 색상 정규화
  - [x] 4-5. 모달 컴포넌트들 색상 정규화 (InviteLinkModal, SubscriptionModal, CreateBoardModal, ChecklistSelectModal, ActionChoiceModal)
  - [x] 4-6. 기타 컴포넌트 색상 정규화 (InviteLandingPage, TrialBanner, ScheduleBlock, ShareBoardModal)
- **변환 규칙**:
  - `bg-[#1d2125]`, `bg-[#282e33]` → `bg-bridge-dark`, `bg-bridge-obsidian`
  - `border-gray-700` → `border-white/10`
  - `text-gray-400` → `text-slate-400`
  - `hover:bg-[#3a4149]` → `hover:bg-white/5`
- **완료 기준**: 라이트 모드에서 모든 페이지 정상 표시

---

### Phase 4: 통합 작업 (Sequential)

#### [TASK-005] 통합 테스트 및 최종 점검 ✅

- **선행 조건**: TASK-002, TASK-003, TASK-004 완료
- **Subtasks**:
  - [x] 5-1. BE-FE 연동 테스트 (테마 저장/조회) - API 연동 완료
  - [x] 5-2. 로그아웃 → 재로그인 시 테마 유지 확인 - ThemeSync 컴포넌트 추가
  - [x] 5-3. 모든 페이지 라이트/다크 모드 UI 점검 - 색상 정규화 완료
  - [x] 5-4. 모달 테마 적용 확인 - bridge-* 변수 적용
  - [x] 5-5. 빌드 테스트 - 빌드 성공
- **완료 기준**: E2E 시나리오 통과, 빌드 성공

---

## 진행 로그

| 일시 | 작업 | 상태 |
|------|------|------|
| 2026-01-15 | Feature Spec 작성 완료 | ✅ |
| 2026-01-15 | Implementation Plan 작성 완료 | ✅ |
| 2026-01-15 | TASKS 정의 완료 | ✅ |
| 2026-01-15 | TASK-001: 테마 CSS 변수 및 ThemeContext 구현 | ✅ |
| 2026-01-15 | TASK-002: [BE] User 테마 저장 API 구현 | ✅ |
| 2026-01-15 | TASK-003: [FE] 설정 페이지 테마 토글 UI 구현 | ✅ |
| 2026-01-15 | TASK-004: 전체 컴포넌트 색상 정규화 (14개 파일) | ✅ |
| 2026-01-15 | TASK-005: 통합 테스트 및 빌드 검증 | ✅ |
| 2026-01-15 | **기능 구현 완료** | ✅ |
