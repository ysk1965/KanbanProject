# Organization Member Detail Page 기획서

> **Version**: 1.0.0
> **Date**: 2026-02-26
> **Status**: Draft
> **관련 파일**: `OrgMembersTab.tsx`, `OrgMemberController.java`, `OrgMemberService.java`

---

## 1. 개요

조직(Organization)의 구성원 목록에서 개별 멤버를 클릭하면 표시되는 **구성원 상세 프로필 페이지**를 설계한다.
기존 `OrgMembersTab`의 멤버 카드 → 클릭 시 프로필 상세 뷰로 진입하는 UX를 추가한다.

### 1.1 목표
- 구성원의 기본 정보, 소속/역할, 활동 현황을 한눈에 파악
- Admin은 멤버 정보를 직접 수정 가능 (인라인 편집)
- 본인 프로필도 조회 및 일부 항목 자편집 가능

### 1.2 진입 경로
```
Organization Detail Page
  └─ 구성원 탭 (OrgMembersTab)
       └─ 멤버 카드 클릭 → MemberDetailModal (MotionModal)
```

> **구현 방식**: 별도 페이지가 아닌 **MotionModal**로 구현하여 조직 페이지 컨텍스트를 유지한다.

---

## 2. 데이터 소스

### 2.1 기존 백엔드 API (변경 불필요)

| API | 용도 |
|-----|------|
| `GET /api/v1/organizations/{orgId}/members/{memberId}` | 멤버 상세 정보 (`OrgMemberDetail`) |
| `PUT /api/v1/organizations/{orgId}/members/{memberId}` | 멤버 정보 수정 |
| `PUT /api/v1/organizations/{orgId}/members/{memberId}/role` | 역할 변경 |
| `DELETE /api/v1/organizations/{orgId}/members/{memberId}` | 멤버 제거 |

### 2.2 추가 필요 API

| API | 용도 | 설명 |
|-----|------|------|
| `GET /api/v1/organizations/{orgId}/members/{memberId}/boards` | 멤버 소속 보드 목록 | 해당 멤버가 참여 중인 조직 보드 리스트 |
| `GET /api/v1/organizations/{orgId}/members/{memberId}/leave-balances` | 멤버 휴가 잔여 현황 | 해당 멤버의 연도별 휴가 잔량 (Admin 전용) |

### 2.3 사용 가능한 데이터 필드 (OrgMemberDetail)

| 필드 | 타입 | 설명 |
|------|------|------|
| `user.name` | string | 이름 |
| `user.email` | string | 이메일 |
| `user.profile_image` | string? | 프로필 이미지 URL |
| `role` | OrgRole | OWNER / ADMIN / MEMBER |
| `department.name` | string? | 부서명 |
| `job_group.name` | string? | 직군명 |
| `job_title` | string? | 직책/직무 |
| `contract_type` | ContractType | FULL_TIME / CONTRACT / INTERN / PART_TIME |
| `work_status` | WorkStatus | ACTIVE / ON_LEAVE / RESIGNED |
| `employee_id` | string? | 사번 |
| `phone` | string? | 연락처 |
| `birth_date` | string? | 생년월일 |
| `hire_date` | string? | 입사일 |
| `bio` | string? | 자기 소개 |
| `tenure_months` | number | 근무 기간 (월) |
| `joined_at` | string | 조직 가입일 |
| `invited_by` | UserInfo? | 초대한 사람 |

---

## 3. UI 구조

### 3.1 모달 레이아웃 (MemberDetailModal)

```
┌──────────────────────────────────────────────────────────────┐
│ [Accent Line: gradient from-bridge-accent to-bridge-secondary] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────┐  Name ████████  [ROLE BADGE]  [STATUS BADGE]      │
│  │Avatar│  Department · Job Title                            │
│  │ 64px │  user@email.com                                    │
│  └──────┘                                          [⋮ More] │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [ 프로필 ]  [ 활동 ]  [ 보드 ]                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ Tab Content Area ──────────────────────────────────────┐ │
│  │                                                         │ │
│  │  (각 탭에 따른 콘텐츠)                                     │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Esc 닫기                                    [Edit / Save]  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 모달 사이즈
- **Desktop**: `max-w-2xl` (672px)
- **Mobile**: 풀스크린 바텀시트 (`rounded-t-2xl`)
- **최대 높이**: `max-h-[85vh]`, 내부 스크롤

---

## 4. 상세 디자인

### 4.1 프로필 헤더

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  ┌────────┐                                            │
│  │        │  김민수              [ADMIN]  [ACTIVE]     │
│  │ Avatar │  Engineering · Frontend Lead               │
│  │  64px  │  minsu@company.com                         │
│  │        │                                            │
│  └────────┘                                     [⋮]   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Avatar**:
- 64x64px, `rounded-full`
- 이미지 있으면 `object-cover`, 없으면 이니셜 (이름 첫 글자)
- 이니셜 배경: `bg-bridge-accent/20 text-bridge-accent text-xl font-bold`

**이름 영역**:
- 이름: `text-xl font-bold text-slate-900 dark:text-white`
- 부서 · 직책: `text-sm text-slate-500 dark:text-slate-400`
- 이메일: `text-xs text-slate-400 dark:text-slate-500`

**역할 뱃지**:
| 역할 | 스타일 |
|------|--------|
| OWNER | `bg-amber-500/20 text-amber-600 dark:text-amber-400` |
| ADMIN | `bg-bridge-accent/20 text-bridge-accent` |
| MEMBER | `bg-slate-500/20 text-slate-500 dark:text-slate-400` |

**상태 뱃지**: 기존 `STATUS_BADGE` 매핑 재사용

**더보기 메뉴 (⋮)**: Admin 전용
- 역할 변경
- 멤버 제거
- (구분선)
- 프로필 수정

### 4.2 탭 네비게이션

```tsx
const MEMBER_TABS = [
  { key: 'profile', label: '프로필', icon: User },
  { key: 'activity', label: '활동', icon: Activity },
  { key: 'boards', label: '보드', icon: LayoutGrid },
];
```

**스타일**:
```tsx
// 탭 컨테이너
<div className="flex gap-1 border-b border-black/5 dark:border-white/5 px-6">
  {tabs.map(tab => (
    <button className={cn(
      "px-4 py-2.5 text-sm font-medium transition-colors relative",
      active === tab.key
        ? "text-bridge-accent"
        : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
    )}>
      {tab.label}
      {active === tab.key && (
        <motion.div layoutId="member-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-bridge-accent" />
      )}
    </button>
  ))}
</div>
```

---

### 4.3 프로필 탭 (Profile)

세로 2-섹션 구성: **인적 정보** + **자기 소개**

#### 4.3.1 인적 정보 카드

```
┌──────────────────────────────────────────────────┐
│  인적 정보                              [✏ Edit] │
├──────────────────────────────────────────────────┤
│                                                  │
│  사번          CA00419                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  계약 유형      정규직                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  직군          개발                               │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  연락처         010-1234-5678                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  생년월일       1995.05.16                        │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  입사일         2025.03.01                        │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  근무 기간      11개월                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  조직 가입일    2025.03.01                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  초대한 사람    Admin                              │
│                                                  │
└──────────────────────────────────────────────────┘
```

**레이아웃**: 2-column grid (label + value)
```tsx
<div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-5">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white">인적 정보</h3>
    {canEdit && <EditButton />}
  </div>
  <div className="space-y-0">
    {fields.map(field => (
      <div className="flex items-center py-2.5 border-b border-black/[0.03] dark:border-white/[0.03] last:border-0">
        <span className="w-24 text-xs text-slate-400 shrink-0">{field.label}</span>
        <span className="text-sm text-slate-900 dark:text-white">{field.value || '—'}</span>
      </div>
    ))}
  </div>
</div>
```

**필드 목록 및 편집 권한**:

| 필드 | Admin 편집 | 본인 편집 | 표시 형식 |
|------|-----------|----------|----------|
| 사번 (employee_id) | O | X | 그대로 |
| 계약 유형 (contract_type) | O | X | FULL_TIME → "정규직" 등 |
| 직군 (job_group) | O | O | job_group.name |
| 부서 (department) | O | O | department.name |
| 직책 (job_title) | O | O | 그대로 |
| 연락처 (phone) | O | O | 그대로 |
| 생년월일 (birth_date) | O | X | YYYY.MM.DD |
| 입사일 (hire_date) | O | X | YYYY.MM.DD |
| 근무 기간 (tenure_months) | — (자동계산) | — | "N개월" 또는 "N년 M개월" |
| 조직 가입일 (joined_at) | — (읽기전용) | — | YYYY.MM.DD |
| 초대한 사람 (invited_by) | — (읽기전용) | — | invited_by.name |

#### 4.3.2 자기 소개 (Bio)

```
┌──────────────────────────────────────────────────┐
│  자기 소개                              [✏ Edit] │
├──────────────────────────────────────────────────┤
│                                                  │
│  안녕하세요! 프론트엔드 개발자 김민수입니다.          │
│  React와 TypeScript를 좋아하며, 좋은 UI/UX를       │
│  만드는 것에 관심이 많습니다.                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

- Admin + 본인 편집 가능
- 편집 모드: `textarea` (최대 500자)
- 비어있을 때: 본인이면 "자기 소개를 작성해보세요" placeholder, 타인이면 "소개가 없습니다" 표시

#### 4.3.3 휴가 현황 요약 (Admin 전용)

Admin이 타 멤버 프로필을 볼 때만 표시:

```
┌──────────────────────────────────────────────────┐
│  휴가 현황 (2026)                                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  연차    ████████░░░░  8 / 15일                  │
│  병가    ░░░░░░░░░░░░  0 / 3일                   │
│  리프레시 ██░░░░░░░░░░  1 / 5일                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 프로그레스 바: `bg-bridge-accent` (사용) + `bg-black/5 dark:bg-white/5` (남은)
- 잔량 적을 때 (80% 이상 사용): 바 색상 `bg-amber-500`

---

### 4.4 활동 탭 (Activity)

> **v1.0에서는 간단한 통계 카드만 표시, 추후 Activity Feed 확장 가능**

#### 4.4.1 활동 요약 카드 (Stat Cards)

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  📅          │ │  📋          │ │  💬          │ │  📝          │
│  입사일       │ │  참여 보드    │ │  근무 기간    │ │  계약 유형    │
│  2025.03.01  │ │  3개         │ │  11개월      │ │  정규직       │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**스타일**:
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {stats.map(stat => (
    <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-4 text-center">
      <div className="text-2xl mb-2">{stat.icon}</div>
      <div className="text-[11px] text-slate-400 mb-1">{stat.label}</div>
      <div className="text-sm font-bold text-slate-900 dark:text-white">{stat.value}</div>
    </div>
  ))}
</div>
```

#### 4.4.2 최근 활동 타임라인 (v2.0 예정)

```
┌──────────────────────────────────────────────────┐
│  최근 활동                                        │
├──────────────────────────────────────────────────┤
│                                                  │
│  ● 2026-02-25  "Backend API" 보드에 태스크 생성     │
│  │                                               │
│  ● 2026-02-24  "Frontend" 보드에서 카드 이동        │
│  │                                               │
│  ● 2026-02-22  "Design System" 보드에 참여          │
│                                                  │
│  (Activity Log 연동 필요 - v2.0)                   │
└──────────────────────────────────────────────────┘
```

- v1.0에서는 "활동 내역은 준비 중입니다" 플레이스홀더
- v2.0에서 ActivityLog 테이블 연동

---

### 4.5 보드 탭 (Boards)

멤버가 참여 중인 조직 보드 목록:

```
┌──────────────────────────────────────────────────┐
│  참여 보드 (3)                                    │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🎯 Backend API                            │  │
│  │  REST API 및 비즈니스 로직        3명 참여    │  │
│  │  Owner: Admin       Created: 2025.03.01    │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🎨 Frontend                               │  │
│  │  React UI 컴포넌트              5명 참여     │  │
│  │  Owner: 김민수       Created: 2025.04.15   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  📐 Design System                          │  │
│  │  디자인 시스템 관리              2명 참여     │  │
│  │  Owner: 이수진       Created: 2025.05.20   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**보드 카드 스타일**:
```tsx
<div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-4
  hover:border-bridge-accent/30 transition-all cursor-pointer">
  <div className="flex items-center gap-2 mb-1">
    <span className="text-sm font-bold text-slate-900 dark:text-white">{board.name}</span>
    <span className="text-[10px] text-slate-400">{board.member_count}명</span>
  </div>
  <p className="text-xs text-slate-400 truncate">{board.description}</p>
  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
    <span>Owner: {board.owner.name}</span>
    <span>{formatDate(board.created_at)}</span>
  </div>
</div>
```

- 보드 클릭 시 해당 보드 페이지(`/boards/{boardId}`)로 이동
- 보드가 없을 때: "참여 중인 보드가 없습니다" 표시

---

## 5. 인터랙션

### 5.1 편집 모드

**인라인 편집 방식** (모달 내 모달 없이):

1. Edit 버튼 클릭 → 해당 섹션이 편집 모드로 전환
2. 필드가 input/select로 변경
3. Save / Cancel 버튼 표시
4. Save → API 호출 (`PUT /members/{memberId}`) → 성공 시 데이터 갱신
5. Cancel → 원래 값으로 복원

**편집 모드 전환 애니메이션**:
```tsx
<AnimatePresence mode="wait">
  {isEditing ? (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Input fields */}
    </motion.div>
  ) : (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Read-only display */}
    </motion.div>
  )}
</AnimatePresence>
```

### 5.2 편집 가능 필드별 입력 유형

| 필드 | 입력 유형 | 비고 |
|------|----------|------|
| employee_id | `<input type="text">` | — |
| contract_type | `<select>` | 4가지 옵션 |
| work_status | `<select>` | 3가지 옵션 |
| department | `<select>` | 조직 부서 목록 |
| job_group | `<select>` | 조직 직군 목록 |
| job_title | `<input type="text">` | — |
| phone | `<input type="tel">` | — |
| birth_date | `<input type="date">` | — |
| hire_date | `<input type="date">` | — |
| bio | `<textarea>` | maxLength 500 |

### 5.3 더보기 메뉴 (Admin)

**드롭다운 메뉴** (⋮ 버튼):

```
┌──────────────────┐
│  역할 변경    →   │
│  ─ ─ ─ ─ ─ ─ ─  │
│  멤버 제거        │  ← text-red-500
└──────────────────┘
```

- **역할 변경**: 서브메뉴로 ADMIN / MEMBER 선택 (OWNER 불가)
- **멤버 제거**: 확인 다이얼로그 표시 후 실행
  - "김민수님을 조직에서 제거하시겠습니까? 소속된 보드에서도 함께 제거됩니다."
  - 제거 완료 후 모달 닫기 + 멤버 목록 새로고침

### 5.4 권한별 뷰 차이

| 기능 | OWNER | ADMIN | MEMBER (타인) | MEMBER (본인) |
|------|-------|-------|--------------|-------------|
| 프로필 조회 | O | O | O | O |
| 인적 정보 편집 | O | O | X | 일부 (phone, bio, job_title 등) |
| 역할 변경 | O | O | X | X |
| 멤버 제거 | O | O | X | X |
| 휴가 현황 | O | O | X | O (본인) |
| 보드 목록 | O | O | O | O |

---

## 6. 컴포넌트 구조

### 6.1 새로 생성할 파일

```
frontend/src/app/components/organization/
├── MemberDetailModal.tsx          # 메인 모달 컴포넌트
├── member/
│   ├── MemberProfileHeader.tsx    # 프로필 헤더 (아바타 + 이름 + 뱃지)
│   ├── MemberProfileTab.tsx       # 프로필 탭 (인적 정보 + 자기소개 + 휴가)
│   ├── MemberActivityTab.tsx      # 활동 탭 (통계 카드 + 타임라인 placeholder)
│   └── MemberBoardsTab.tsx        # 보드 탭 (참여 보드 목록)
```

### 6.2 수정할 파일

```
frontend/src/app/components/organization/tabs/OrgMembersTab.tsx
  → 멤버 카드 클릭 핸들러 추가
  → MemberDetailModal import 및 state 추가

frontend/src/app/utils/services.ts
  → organizationService에 신규 API 메서드 추가:
    - getMemberBoards(orgId, memberId)
    - getMemberLeaveBalances(orgId, memberId)

frontend/src/app/types/index.ts
  → OrgMemberBoard 인터페이스 추가 (필요시)
```

### 6.3 백엔드 추가 구현

```
backend/src/main/java/com/kanban/domain/organization/
  controller/OrgMemberController.java
    → GET /{memberId}/boards 엔드포인트 추가

  service/OrgMemberService.java
    → getMemberBoards() 메서드 추가

  controller/LeaveController.java (또는 OrgMemberController)
    → GET /{memberId}/leave-balances 엔드포인트 추가
```

---

## 7. 스타일 가이드 (Organization dark: 패턴)

이 컴포넌트는 **Organization 영역**에 속하므로 `dark:` 기반 패턴을 따른다:

```tsx
// 카드 배경
className="bg-black/[0.02] dark:bg-white/[0.02]"

// 테두리
className="border border-black/5 dark:border-white/5"

// 텍스트
className="text-slate-900 dark:text-white"        // 주요 텍스트
className="text-slate-500 dark:text-slate-400"     // 보조 텍스트
className="text-slate-400"                         // 라벨

// 인풋
className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
  text-slate-900 dark:text-white rounded-xl"

// 모달
className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5"
```

---

## 8. 반응형 대응

| 뷰포트 | 동작 |
|--------|------|
| Desktop (md+) | MotionModal center, `max-w-2xl` |
| Mobile (<md) | 바텀시트, `rounded-t-2xl`, 풀 width |
| Stat Cards | Desktop 4열, Mobile 2열 |
| 인적 정보 | label 고정폭 (w-24), value 유동 |
| 보드 카드 | Desktop 2열, Mobile 1열 |

---

## 9. i18n 키

```json
{
  "organization.member.detail.title": "Member Detail",
  "organization.member.detail.profileTab": "Profile",
  "organization.member.detail.activityTab": "Activity",
  "organization.member.detail.boardsTab": "Boards",
  "organization.member.detail.personalInfo": "Personal Info",
  "organization.member.detail.bio": "Bio",
  "organization.member.detail.bioPlaceholder": "Write about yourself...",
  "organization.member.detail.noBio": "No bio provided",
  "organization.member.detail.leaveBalance": "Leave Balance",
  "organization.member.detail.employeeId": "Employee ID",
  "organization.member.detail.contractType": "Contract Type",
  "organization.member.detail.jobGroup": "Job Group",
  "organization.member.detail.department": "Department",
  "organization.member.detail.jobTitle": "Job Title",
  "organization.member.detail.phone": "Phone",
  "organization.member.detail.birthDate": "Birth Date",
  "organization.member.detail.hireDate": "Hire Date",
  "organization.member.detail.tenure": "Tenure",
  "organization.member.detail.joinedAt": "Joined At",
  "organization.member.detail.invitedBy": "Invited By",
  "organization.member.detail.boards": "Boards",
  "organization.member.detail.noBoards": "Not participating in any boards",
  "organization.member.detail.stats.hireDate": "Hire Date",
  "organization.member.detail.stats.boards": "Boards",
  "organization.member.detail.stats.tenure": "Tenure",
  "organization.member.detail.stats.contract": "Contract",
  "organization.member.detail.changeRole": "Change Role",
  "organization.member.detail.removeMember": "Remove Member",
  "organization.member.detail.removeConfirm": "Remove {{name}} from this organization? They will also be removed from all organization boards.",
  "organization.member.detail.activityComingSoon": "Activity timeline is coming soon",
  "organization.member.detail.tenureFormat.months": "{{count}} months",
  "organization.member.detail.tenureFormat.years": "{{years}}y {{months}}m"
}
```

---

## 10. 구현 순서

### Phase 1: 기본 프로필 뷰 (MVP)
1. `MemberDetailModal` 컴포넌트 생성 (모달 쉘 + 헤더)
2. `MemberProfileTab` 구현 (인적 정보 읽기 전용)
3. `OrgMembersTab`에 클릭 핸들러 + 모달 연결
4. 기존 `GET /members/{memberId}` API 연동

### Phase 2: 편집 기능
5. 인적 정보 인라인 편집 모드
6. Bio 편집
7. 역할 변경 / 멤버 제거 (더보기 메뉴)
8. `PUT /members/{memberId}` API 연동

### Phase 3: 보드 & 휴가 탭
9. 백엔드: `GET /members/{memberId}/boards` 엔드포인트
10. `MemberBoardsTab` 구현
11. 백엔드: `GET /members/{memberId}/leave-balances` 엔드포인트
12. 휴가 현황 카드 구현

### Phase 4: 활동 탭
13. `MemberActivityTab` 통계 카드
14. (v2.0) Activity Log 연동 타임라인

---

## 11. 참고 디자인

- **레퍼런스**: CookApps 구성원 프로필 상세 (스크린샷 참조)
- **BRIDGE 패턴**: `OrgMembersTab.tsx`, `OrgSettingsTab.tsx` (dark: 패턴)
- **MotionModal**: `frontend/src/app/components/ui/MotionModal.tsx`
- **디자인 시스템**: `docs/Design/v1.5.0.md`
