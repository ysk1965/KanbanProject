# Design v12.0 — Organization OKR (Objectives & Key Results)

> **Version**: 12.0
> **Date**: 2026-02-27
> **Status**: Draft — Ideation
> **위치**: 조직 상세 > 워크스페이스 탭 > OKR (3번째 서브탭)

---

## 1. 개요

### 1.1 배경

BRIDGE의 조직(Organization)은 이미 보드, 인사이트, 인원 관리, 조직도를 갖추고 있지만, **"왜 이 일을 하는가"에 대한 방향성 도구**가 없다. OKR은 조직 전체의 전략적 목표를 세우고, 부서·팀·개인 단위로 정렬(Alignment)하여 실행을 추적하는 프레임워크다.

### 1.2 핵심 컨셉

```
조직 OKR (Company-level)
├── 부서 OKR (Department-level)  ← 조직도의 부서 트리와 연동
│   ├── 팀/하위부서 OKR
│   │   └── 개인 KR (Individual)
│   └── 개인 KR
└── 부서 OKR
    └── ...
```

- **조직도 트리 시각화 재활용**: OrgChartTab의 트리 커넥터 패턴을 OKR 계층에 적용
- **부서 구조 자동 연동**: 조직도에 등록된 부서가 OKR 트리의 뼈대
- **상향식 진척률 롤업**: 개인 KR → 팀 KR → 부서 Objective → 조직 Objective로 자동 집계

---

## 2. 정보 구조

### 2.1 핵심 엔티티

```
OkrCycle (사이클)
├── id, organization_id
├── name             — "2026 Q1", "2026 상반기"
├── cycle_type       — QUARTERLY | HALF_YEARLY | YEARLY | CUSTOM
├── start_date, end_date
├── status           — PLANNING | ACTIVE | REVIEW | CLOSED
└── created_by

OkrObjective (목표 — O)
├── id, cycle_id, organization_id
├── title            — "글로벌 MAU 10만 달성"
├── description
├── level            — COMPANY | DEPARTMENT | INDIVIDUAL
├── department_id    — nullable (DEPARTMENT 레벨일 때 조직도 부서 연결)
├── owner_id         — 담당자 (OrgMember)
├── parent_objective_id — nullable (상위 Objective 연결 → 트리 구조)
├── progress         — 0~100 (하위 KR 가중평균 자동계산)
├── confidence       — ON_TRACK | AT_RISK | OFF_TRACK
├── sort_order
└── created_at, updated_at

OkrKeyResult (핵심 결과 — KR)
├── id, objective_id
├── title            — "신규 가입자 월 2만명 확보"
├── description
├── metric_type      — PERCENTAGE | NUMBER | CURRENCY | BOOLEAN | MILESTONE
├── start_value      — 시작값 (0)
├── target_value     — 목표값 (20000)
├── current_value    — 현재값 (12500)
├── unit             — "명", "원", "%", etc.
├── owner_id         — 담당자 (OrgMember)
├── weight           — 가중치 (기본 1.0, Objective 내 KR 간 비중 조절)
├── linked_board_id  — nullable (연결된 Board → 태스크 자동 추적)
├── sort_order
└── created_at, updated_at

OkrCheckIn (체크인 — 주기적 업데이트)
├── id, key_result_id
├── previous_value, new_value
├── confidence       — ON_TRACK | AT_RISK | OFF_TRACK
├── note             — "지난주 캠페인 효과로 가입자 급증"
├── author_id
└── created_at
```

### 2.2 관계도

```
Organization ──1:N──> OkrCycle ──1:N──> OkrObjective ──1:N──> OkrKeyResult ──1:N──> OkrCheckIn
                                              │
                                              ├── parent_objective_id (self-ref, 트리)
                                              └── department_id → Department (조직도 연동)
```

---

## 3. UI/UX 설계

### 3.1 진입점

```
조직 상세 > 워크스페이스 탭
├── 보드        (기존)
├── 인사이트    (기존)
└── OKR         (신규 ★)
```

`OrganizationDetailPage.tsx` TAB_GROUPS의 workspace 서브탭에 `{ key: "okr", labelKey: "organization.tabs.okr" }` 추가.

### 3.2 OKR 탭 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│  [사이클 셀렉터 ▾ 2026 Q1]     [+ 목표 추가]    [트리 | 리스트] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── 조직 전체 진척률 ────────────────────────────────────┐  │
│  │  ████████████████░░░░  68%   ON_TRACK                  │  │
│  │  3 Objectives · 9 Key Results · 마감 32일 남음           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│                    ┌──────────────┐                          │
│                    │  🏢 조직 O1  │                          │
│                    │  글로벌 MAU   │                          │
│                    │  ████ 72%    │                          │
│                    └──────┬───────┘                          │
│                           │                                  │
│              ┌────────────┼────────────┐                     │
│              │                         │                     │
│       ┌──────┴──────┐          ┌───────┴─────┐              │
│       │ 📦 개발팀 O  │          │ 📣 마케팅 O  │              │
│       │ 플랫폼 안정성 │          │ 인지도 확대   │              │
│       │ ████ 80%    │          │ ███░ 60%    │              │
│       └──────┬──────┘          └───────┬─────┘              │
│              │                         │                     │
│     ┌────────┼────────┐         ┌──────┼──────┐             │
│     │                 │         │             │              │
│  ┌──┴──┐          ┌───┴──┐  ┌──┴──┐      ┌───┴──┐          │
│  │KR 1 │          │KR 2  │  │KR 1 │      │KR 2  │          │
│  │서버  │          │배포   │  │광고  │      │블로그 │          │
│  │95%   │          │65%   │  │50%   │      │70%   │          │
│  └──────┘          └──────┘  └─────┘      └──────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 트리 뷰 — OrgChart 패턴 재활용

OrgChartTab의 `DepartmentTreeView` 패턴을 그대로 차용:

| OrgChart 요소 | OKR 대응 | 비주얼 |
|---|---|---|
| Organization Root | 조직 전체 OKR 요약 카드 | `bg-bridge-obsidian rounded-2xl` |
| Department Card | Objective 카드 | 동일 스타일 + 프로그레스 바 |
| Vertical Connector | `w-px h-6 bg-foreground/10` | 동일 |
| Horizontal Connector | `DeptChildrenRow` 패턴 | 동일 |
| Member List | Key Result 리스트 | 카드 하단 `border-t` 영역 |
| Child Count Badge | KR 개수 뱃지 | `bg-bridge-accent/90 text-white` |
| Collapse/Expand | `AnimatePresence` + `ChevronDown` | 동일 |

#### Objective 트리 노드 카드

```tsx
// OKR Objective Node (OrgChart DepartmentTreeNode 패턴 차용)
<motion.div
  whileHover={{ scale: 1.02 }}
  className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
    min-w-[200px] max-w-[260px] shadow-sm hover:border-foreground/[0.12]
    transition-colors group"
>
  {/* Header */}
  <div className="px-4 py-3">
    <div className="flex items-center gap-2">
      {/* Level 아이콘: COMPANY=Building2, DEPARTMENT=Layers, INDIVIDUAL=User */}
      <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center">
        <Target size={14} className="text-bridge-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-foreground truncate">
          {objective.title}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {department?.name || owner?.name}
        </div>
      </div>
    </div>
    {/* Progress Bar */}
    <div className="mt-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-foreground">{progress}%</span>
        <ConfidenceBadge confidence={objective.confidence} />
      </div>
      <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-bridge-accent"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  </div>

  {/* Key Results (하단 펼침) */}
  <div className="px-3 pb-2.5 border-t border-foreground/[0.06]">
    {keyResults.map(kr => (
      <KeyResultRow key={kr.id} kr={kr} />
    ))}
  </div>

  {/* Child Objective Count Badge */}
  {hasChildren && (
    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold
        px-2 py-0.5 rounded-full bg-bridge-accent/90 text-white shadow-sm">
        {childCount}
        <ChevronDown size={10} />
      </span>
    </div>
  )}
</motion.div>
```

#### Confidence 뱃지 (신호등)

```tsx
// 3단계 상태 표시
ON_TRACK  → bg-emerald-500/15 text-emerald-600 dark:text-emerald-400  "순항"
AT_RISK   → bg-amber-500/15 text-amber-600 dark:text-amber-400       "주의"
OFF_TRACK → bg-red-500/15 text-red-600 dark:text-red-400              "위험"
```

#### Key Result 행

```tsx
<div className="flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-foreground/5">
  {/* 메트릭 타입 아이콘 */}
  <BarChart3 size={12} className="text-slate-400 shrink-0" />
  {/* 제목 */}
  <span className="text-[10px] text-foreground truncate flex-1">{kr.title}</span>
  {/* 현재값 / 목표값 */}
  <span className="text-[10px] font-bold text-bridge-accent shrink-0">
    {kr.current_value}/{kr.target_value}{kr.unit}
  </span>
  {/* 미니 프로그레스 */}
  <div className="w-12 h-1 rounded-full bg-foreground/[0.06] shrink-0">
    <div className="h-full rounded-full bg-bridge-accent"
      style={{ width: `${(kr.current_value/kr.target_value)*100}%` }} />
  </div>
</div>
```

### 3.4 리스트 뷰 (대안 뷰)

트리 뷰 외에 **리스트 뷰**도 제공 (OrgChart의 ListView 패턴과 동일 토글):

```
┌─────────────────────────────────────────────────────────────┐
│  ▾ 🏢 글로벌 MAU 10만 달성                    72%  ON_TRACK │
│    ├─ KR1: 신규 가입자 월 2만명            12,500/20,000명  │
│    ├─ KR2: DAU 3만명 유지                  28,000/30,000명  │
│    └─ KR3: 이탈률 5% 이하                      6.2/5.0%    │
│                                                             │
│    ▾ 📦 개발팀 — 플랫폼 안정성 확보             80%  ON_TRACK │
│      ├─ KR1: 서버 가용성 99.9%                99.85/99.9%   │
│      └─ KR2: 배포 주기 주 2회                    1.5/2.0회   │
│                                                             │
│    ▾ 📣 마케팅팀 — 브랜드 인지도 확대           60%  AT_RISK  │
│      ├─ KR1: 광고 CTR 3%                       2.1/3.0%    │
│      └─ KR2: 블로그 월 조회수 5만              35,000/50,000 │
└─────────────────────────────────────────────────────────────┘
```

- 들여쓰기로 계층 표현 (depth * 24px padding)
- Objective 행: 접기/펼치기 가능
- KR 행: 인라인 프로그레스 + 수치

### 3.5 Objective 상세 모달

Objective 카드 클릭 시 MotionModal로 상세 정보 표시:

```
┌─ MotionModal ─────────────────────────────────────────────┐
│ ─── Top Accent Line ──────────────────────────────────── │
│                                                           │
│  🎯 글로벌 MAU 10만 달성                         ON_TRACK │
│  조직 전체 목표 · 담당: 김대표 · Q1 2026                   │
│                                                           │
│  ████████████████████████░░░░░░░  72%                     │
│                                                           │
│  ── Key Results ──────────────────────────────────────── │
│                                                           │
│  1. 신규 가입자 월 2만명 확보                              │
│     ██████████████░░░░░░  12,500 / 20,000명    62%       │
│     담당: 이마케터 · 최근 체크인: 2일 전                    │
│     [+ 체크인]                                            │
│                                                           │
│  2. DAU 3만명 유지                                        │
│     ██████████████████░░  28,000 / 30,000명    93%       │
│     담당: 박개발 · 최근 체크인: 1일 전                      │
│     [+ 체크인]                                            │
│                                                           │
│  ── 하위 Objectives (2) ─────────────────────────────── │
│     📦 개발팀: 플랫폼 안정성 확보        80%  ON_TRACK     │
│     📣 마케팅팀: 브랜드 인지도 확대      60%  AT_RISK      │
│                                                           │
│  ── 체크인 히스토리 ─────────────────────────────────── │
│     2/25  이마케터  KR1: 10,000 → 12,500  "캠페인 효과"   │
│     2/22  박개발    KR2: 25,000 → 28,000  "신규 기능 출시" │
│                                                           │
│  ───────────────────────────────────────────────────────  │
│  Esc 닫기                              [수정] [체크인]    │
└───────────────────────────────────────────────────────────┘
```

### 3.6 체크인 플로우

주기적으로 KR 값을 업데이트하는 핵심 워크플로우:

```
[+ 체크인] 클릭
  → 인라인 입력 or 미니 모달
  → 현재값 입력 (이전값 자동 표시)
  → Confidence 선택 (ON_TRACK / AT_RISK / OFF_TRACK)
  → 메모 입력 (선택)
  → 저장 → KR current_value 업데이트 → Objective progress 재계산 → 상위 롤업
```

---

## 4. 핵심 기능 상세

### 4.1 사이클 관리

| 기능 | 설명 |
|---|---|
| 사이클 생성 | 분기/반기/연간/커스텀 기간 설정 |
| 사이클 상태 | PLANNING → ACTIVE → REVIEW → CLOSED |
| PLANNING 단계 | Objective/KR 작성, 정렬 조율 기간 |
| ACTIVE 단계 | 실행 + 체크인 (KR 값 업데이트 가능) |
| REVIEW 단계 | 회고, 최종 점수 확정 |
| CLOSED | 읽기 전용 아카이브 |

### 4.2 진척률 자동 계산

```
KR 진척률 = (current_value - start_value) / (target_value - start_value) × 100

Objective 진척률 = Σ(KR_i 진척률 × KR_i weight) / Σ(KR_i weight)

상위 Objective 진척률 = 하위 Objective들의 평균 (가중 없음)

조직 전체 진척률 = Company-level Objective들의 평균
```

- `BOOLEAN` 타입: 0% or 100%
- `MILESTONE` 타입: 사용자가 직접 % 입력

### 4.3 부서 연동 (조직도 트리)

```
조직도 부서 트리              OKR 트리
─────────────              ─────────
BRIDGE Org                 Company OKR
├── 개발팀         →       ├── 개발팀 Objective
│   ├── 프론트팀   →       │   ├── 프론트팀 Objective
│   └── 백엔드팀   →       │   └── 백엔드팀 Objective
└── 마케팅팀       →       └── 마케팅팀 Objective
```

- Objective 생성 시 `level: DEPARTMENT` 선택하면 부서 드롭다운 표시
- 선택된 부서의 리더가 자동으로 owner로 제안됨
- 부서 구조 변경 시 OKR 트리는 영향받지 않음 (독립 트리, 참조만)

### 4.4 Board 연결 (선택)

KR에 기존 Board를 연결하면:
- 해당 Board의 완료 태스크 수를 KR `current_value`에 자동 반영 (metric_type: NUMBER일 때)
- 또는 Board 인사이트의 작업 시간을 KR로 매핑
- 연결은 **힌트** 수준, 최종 값은 수동 체크인으로 확정

### 4.5 권한 모델

| 역할 | 사이클 관리 | Company O 생성 | Dept O 생성 | KR 체크인 | 조회 |
|---|---|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| MEMBER | ❌ | ❌ | 본인 부서만 | 본인 KR만 | ✅ |

---

## 5. 뷰 모드 상세

### 5.1 트리 뷰 (기본 — 조직도 스타일)

```
[트리 뷰 특징]
- OrgChartTab의 DepartmentTreeView + DeptChildrenRow + DepartmentTreeNode 패턴 재사용
- 수평 스크롤 지원 (overflow-x-auto)
- 노드 간 수직/수평 커넥터 라인 (bg-foreground/10)
- Framer Motion whileHover scale, AnimatePresence expand/collapse
- 부서별 색상 코딩 (부서 accent color 또는 confidence 색상)
- 프로그레스 바가 카드 내부에 표시
- KR 리스트가 카드 하단에 접기/펼치기
```

### 5.2 리스트 뷰

```
[리스트 뷰 특징]
- OrgChartTab의 ListView 패턴 재사용
- 들여쓰기 기반 계층 (depth × 24px)
- 접기/펼치기 (Objective 단위)
- 한눈에 전체 현황 파악 가능
- 모바일에서도 사용 편리
```

### 5.3 타임라인 뷰 (향후 확장)

```
[타임라인 뷰 — Phase 2]
- 사이클 기간을 가로축으로
- Objective별 간트 차트 형태
- 체크인 포인트를 점으로 표시
- 진척 추이 라인 그래프 오버레이
```

---

## 6. API 설계

### 6.1 Endpoints

```
# 사이클
GET    /api/v1/organizations/{orgId}/okr/cycles
POST   /api/v1/organizations/{orgId}/okr/cycles
PUT    /api/v1/organizations/{orgId}/okr/cycles/{cycleId}
DELETE /api/v1/organizations/{orgId}/okr/cycles/{cycleId}

# Objective
GET    /api/v1/organizations/{orgId}/okr/cycles/{cycleId}/objectives
POST   /api/v1/organizations/{orgId}/okr/cycles/{cycleId}/objectives
PUT    /api/v1/organizations/{orgId}/okr/objectives/{objectiveId}
DELETE /api/v1/organizations/{orgId}/okr/objectives/{objectiveId}

# Key Result
GET    /api/v1/organizations/{orgId}/okr/objectives/{objectiveId}/key-results
POST   /api/v1/organizations/{orgId}/okr/objectives/{objectiveId}/key-results
PUT    /api/v1/organizations/{orgId}/okr/key-results/{krId}
DELETE /api/v1/organizations/{orgId}/okr/key-results/{krId}

# 체크인
GET    /api/v1/organizations/{orgId}/okr/key-results/{krId}/checkins
POST   /api/v1/organizations/{orgId}/okr/key-results/{krId}/checkins

# 트리 전체 조회 (트리 뷰용, 한 번에 로드)
GET    /api/v1/organizations/{orgId}/okr/cycles/{cycleId}/tree
```

### 6.2 트리 응답 구조

```json
{
  "cycle": {
    "id": "...",
    "name": "2026 Q1",
    "status": "ACTIVE",
    "start_date": "2026-01-01",
    "end_date": "2026-03-31",
    "overall_progress": 68,
    "total_objectives": 5,
    "total_key_results": 12
  },
  "objectives": [
    {
      "id": "obj-1",
      "title": "글로벌 MAU 10만 달성",
      "level": "COMPANY",
      "department_id": null,
      "department_name": null,
      "owner": { "id": "m1", "user_name": "김대표", "profile_image_url": "..." },
      "progress": 72,
      "confidence": "ON_TRACK",
      "key_results": [
        {
          "id": "kr-1",
          "title": "신규 가입자 월 2만명",
          "metric_type": "NUMBER",
          "start_value": 0,
          "target_value": 20000,
          "current_value": 12500,
          "unit": "명",
          "owner": { "id": "m2", "user_name": "이마케터" },
          "last_checkin_at": "2026-02-25T09:00:00Z"
        }
      ],
      "children": [
        {
          "id": "obj-2",
          "title": "플랫폼 안정성 확보",
          "level": "DEPARTMENT",
          "department_name": "개발팀",
          "progress": 80,
          "confidence": "ON_TRACK",
          "key_results": [...],
          "children": []
        }
      ]
    }
  ]
}
```

---

## 7. DB 스키마 (Flyway Migration)

```sql
-- V82__create_okr_tables.sql

CREATE TABLE okr_cycles (
    id          VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    name        VARCHAR(100) NOT NULL,
    cycle_type  VARCHAR(20)  NOT NULL DEFAULT 'QUARTERLY',
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'PLANNING',
    created_by  VARCHAR(36)  NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE okr_objectives (
    id                    VARCHAR(36) PRIMARY KEY,
    cycle_id              VARCHAR(36)  NOT NULL REFERENCES okr_cycles(id) ON DELETE CASCADE,
    organization_id       VARCHAR(36)  NOT NULL REFERENCES organizations(id),
    title                 VARCHAR(500) NOT NULL,
    description           TEXT,
    level                 VARCHAR(20)  NOT NULL DEFAULT 'COMPANY',
    department_id         VARCHAR(36)  REFERENCES departments(id),
    owner_id              VARCHAR(36)  REFERENCES org_members(id),
    parent_objective_id   VARCHAR(36)  REFERENCES okr_objectives(id) ON DELETE SET NULL,
    progress              INTEGER      NOT NULL DEFAULT 0,
    confidence            VARCHAR(20)  NOT NULL DEFAULT 'ON_TRACK',
    sort_order            INTEGER      NOT NULL DEFAULT 0,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE okr_key_results (
    id              VARCHAR(36) PRIMARY KEY,
    objective_id    VARCHAR(36)  NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    metric_type     VARCHAR(20)  NOT NULL DEFAULT 'PERCENTAGE',
    start_value     DOUBLE PRECISION NOT NULL DEFAULT 0,
    target_value    DOUBLE PRECISION NOT NULL DEFAULT 100,
    current_value   DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit            VARCHAR(20),
    owner_id        VARCHAR(36)  REFERENCES org_members(id),
    weight          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    linked_board_id VARCHAR(36)  REFERENCES boards(id),
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE okr_checkins (
    id              VARCHAR(36) PRIMARY KEY,
    key_result_id   VARCHAR(36)  NOT NULL REFERENCES okr_key_results(id) ON DELETE CASCADE,
    previous_value  DOUBLE PRECISION NOT NULL,
    new_value       DOUBLE PRECISION NOT NULL,
    confidence      VARCHAR(20)  NOT NULL DEFAULT 'ON_TRACK',
    note            TEXT,
    author_id       VARCHAR(36)  NOT NULL REFERENCES org_members(id),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_okr_cycles_org ON okr_cycles(organization_id);
CREATE INDEX idx_okr_objectives_cycle ON okr_objectives(cycle_id);
CREATE INDEX idx_okr_objectives_parent ON okr_objectives(parent_objective_id);
CREATE INDEX idx_okr_objectives_dept ON okr_objectives(department_id);
CREATE INDEX idx_okr_kr_objective ON okr_key_results(objective_id);
CREATE INDEX idx_okr_checkins_kr ON okr_checkins(key_result_id);
```

---

## 8. Backend 구조

```
domain/okr/
├── OkrCycle.java                       # Entity
├── OkrObjective.java                   # Entity (self-ref tree)
├── OkrKeyResult.java                   # Entity
├── OkrCheckIn.java                     # Entity
├── controller/
│   └── OkrController.java             # REST endpoints
├── dto/
│   ├── OkrCycleRequest.java
│   ├── OkrCycleResponse.java
│   ├── OkrObjectiveRequest.java
│   ├── OkrObjectiveResponse.java
│   ├── OkrKeyResultRequest.java
│   ├── OkrKeyResultResponse.java
│   ├── OkrCheckInRequest.java
│   ├── OkrCheckInResponse.java
│   └── OkrTreeResponse.java           # 트리 전체 응답
├── repository/
│   ├── OkrCycleRepository.java
│   ├── OkrObjectiveRepository.java
│   ├── OkrKeyResultRepository.java
│   └── OkrCheckInRepository.java
└── service/
    ├── OkrService.java                 # 핵심 비즈니스 로직
    └── OkrProgressCalculator.java      # 진척률 롤업 계산
```

---

## 9. Frontend 구조

```
components/organization/
├── tabs/
│   └── OrgOkrTab.tsx                   # 탭 진입점 (사이클 셀렉터 + 뷰 토글)
├── okr/
│   ├── OkrTreeView.tsx                 # 트리 뷰 (OrgChart 패턴 재사용)
│   ├── OkrListView.tsx                 # 리스트 뷰
│   ├── OkrObjectiveNode.tsx            # 트리 노드 카드 (DepartmentTreeNode 대응)
│   ├── OkrChildrenRow.tsx              # 수평 커넥터 행 (DeptChildrenRow 대응)
│   ├── OkrKeyResultRow.tsx             # KR 행 (카드 내 or 리스트)
│   ├── OkrObjectiveModal.tsx           # 상세 모달 (MotionModal)
│   ├── OkrCheckInModal.tsx             # 체크인 입력 모달
│   ├── OkrCycleSelector.tsx            # 사이클 드롭다운
│   ├── OkrProgressBar.tsx              # 프로그레스 바 (재사용)
│   ├── OkrConfidenceBadge.tsx          # ON_TRACK / AT_RISK / OFF_TRACK 뱃지
│   └── OkrSummaryCard.tsx              # 상단 요약 카드
```

---

## 10. 구현 우선순위

### Phase 1 — MVP (Core OKR)

1. DB 마이그레이션 (okr_cycles, okr_objectives, okr_key_results, okr_checkins)
2. Backend CRUD + 트리 조회 API
3. Frontend OrgOkrTab + 리스트 뷰 (가장 빠른 구현)
4. Objective/KR 생성·수정·삭제 모달
5. 체크인 기능 + 진척률 자동 계산

### Phase 2 — 트리 뷰 + 정렬

6. 트리 뷰 (OrgChart 패턴 적용)
7. 부서 연동 (조직도 부서 자동 매핑)
8. Board 연결 (KR ↔ Board 태스크 연동)
9. 사이클 상태 워크플로우 (PLANNING → ACTIVE → REVIEW → CLOSED)

### Phase 3 — 고급 기능

10. 체크인 리마인더 (주간 알림)
11. OKR 인사이트 (사이클 간 비교, 달성률 트렌드)
12. 타임라인 뷰
13. MySpace OKR 위젯 (개인 KR 현황)
14. AI 제안 (Objective → KR 자동 생성 제안)

---

## 11. 고려사항

### 11.1 성능

- 트리 전체 조회 API (`/tree`): JOIN FETCH로 N+1 방지, 한 번에 전체 트리 로드
- Objective → KR → CheckIn 모두 eager하지 않도록 주의 (체크인은 모달 열 때 lazy)
- 사이클당 Objective 수 제한 없음 (트리 뷰에서 접기로 대응)

### 11.2 UX

- 첫 진입 시 사이클 없으면 **EmptyState**: "첫 OKR 사이클을 시작하세요"
- 사이클 전환 시 트리 전체 리로드 (간단하게)
- 모바일에서는 리스트 뷰 기본, 트리 뷰는 가로 스크롤

### 11.3 테스트 데이터 (TestDataService)

`TestDataService.createNewTestOrganization()` 의 16번 항목으로 OKR 샘플 데이터 추가:

```java
// 16. OKR (1 Cycle, 3 Objectives, 7 Key Results, CheckIns)
createOrgOkrData(org, members, departments);
```

#### 샘플 데이터 구성

```
OkrCycle: "2026 Q1" (ACTIVE, 2026-01-01 ~ 2026-03-31)

├── [COMPANY] 글로벌 MAU 10만 달성 (owner: members[0], 72%)
│   ├── KR1: 신규 가입자 월 2만명 (NUMBER, 12500/20000명, owner: members[1])
│   ├── KR2: DAU 3만명 유지 (NUMBER, 28000/30000명, owner: members[2])
│   └── KR3: 이탈률 5% 이하 (PERCENTAGE, 62/100%, owner: members[3])
│
│   ├── [DEPARTMENT] 플랫폼 안정성 확보 (dept: 개발팀, owner: members[2], 80%)
│   │   ├── KR1: 서버 가용성 99.9% (PERCENTAGE, 95/100%, owner: members[4])
│   │   └── KR2: 배포 주기 주 2회 (NUMBER, 1.5/2.0회, owner: members[5])
│   │
│   └── [DEPARTMENT] 브랜드 인지도 확대 (dept: 마케팅팀, owner: members[1], 60%)
│       ├── KR1: 광고 CTR 3% (PERCENTAGE, 70/100%, owner: members[6])
│       └── KR2: 블로그 월 조회수 5만 (NUMBER, 35000/50000, owner: members[7])

CheckIns: 각 KR마다 2~3건 (1~2주 간격, confidence 변화 포함)
```

- 부서 연동: `departments` 리스트에서 개발팀/마케팅팀 매핑
- 멤버 매핑: `members` 리스트의 인덱스 기반 owner 할당
- `TestOrgDataResponse`에 `okrCycleCount`, `okrObjectiveCount` 필드 추가

### 11.4 데이터 무결성

- Objective 삭제 시: 하위 Objective의 `parent_objective_id` → SET NULL (고아 노드 → 루트로 승격)
- 사이클 삭제 시: CASCADE로 관련 Objective, KR, CheckIn 모두 삭제
- 부서 삭제 시: Objective의 `department_id`는 유지 (soft reference)

---

## 12. i18n 키

```json
{
  "organization.tabs.okr": "OKR",
  "okr.cycle": "사이클",
  "okr.objective": "목표 (Objective)",
  "okr.keyResult": "핵심 결과 (Key Result)",
  "okr.checkin": "체크인",
  "okr.progress": "진척률",
  "okr.confidence.onTrack": "순항",
  "okr.confidence.atRisk": "주의",
  "okr.confidence.offTrack": "위험",
  "okr.level.company": "조직 전체",
  "okr.level.department": "부서",
  "okr.level.individual": "개인",
  "okr.cycle.planning": "계획 중",
  "okr.cycle.active": "진행 중",
  "okr.cycle.review": "회고",
  "okr.cycle.closed": "종료",
  "okr.empty.title": "첫 OKR 사이클을 시작하세요",
  "okr.empty.description": "조직의 목표를 설정하고 팀과 정렬하세요",
  "okr.addObjective": "목표 추가",
  "okr.addKeyResult": "핵심 결과 추가",
  "okr.addCheckin": "체크인",
  "okr.daysRemaining": "{{days}}일 남음",
  "okr.view.tree": "트리",
  "okr.view.list": "리스트"
}
```
