# Organization Insights Tab - 기획서

> **Version**: v1.1.0
> **Date**: 2026-02-26
> **Status**: Implemented (P1+P2)
> **Author**: BRIDGE Team

---

## 1. 개요

### 1.1 목적

조직 소속 보드들의 활동 데이터를 집계하여, **구성원별 기여 현황**과 **보드별 리소스 투입 현황**을 시각화하는 인사이트 탭을 제공합니다.

### 1.2 핵심 질문

| 질문 | 대상 |
|------|------|
| 구성원이 어떤 보드에 시간을 많이 투입하고 있는가? | 구성원별 뷰 |
| 조직의 리소스가 어떤 보드에 집중되고 있는가? | 보드별 뷰 |
| 기간 대비 활동량의 증감 추이는? | 요약 카드 + 추이 차트 |

### 1.3 위치 및 접근

- **탭 이름**: 인사이트 (Insights)
- **위치**: 조직 상세 페이지 6번째 탭 (Settings 앞)
- **아이콘**: `TrendingUp` (Lucide React) — Dashboard 탭이 이미 `BarChart3` 사용 중이므로 구분

---

## 2. 권한

| 역할 | 접근 범위 |
|------|----------|
| OWNER | 전체 구성원 + 전체 보드 인사이트 |
| ADMIN | 전체 구성원 + 전체 보드 인사이트 |
| MEMBER | 본인 기여도만 (다른 구성원은 비노출) |

---

## 3. 데이터 소스

기존 인프라를 활용하여 신규 테이블 없이 집계합니다.

| 소스 테이블 | 데이터 | 활용 |
|------------|--------|------|
| `schedule_blocks` | 시간 블록 (assignee, start/end_time, scheduled_date) | 투입 시간 계산 |
| `checklist_items` | 체크리스트 (assignee, is_completed) | 완료 건수 |
| `tasks` | 태스크 (is_completed, feature_id) | 태스크 완료율 |
| `features` | 피처 (total_tasks, completed_tasks) | 피처 진행률 |
| `activity_log` | 활동 로그 (user, action, board, created_at) | 활동 빈도 |
| `organization_boards` | 조직-보드 연결 | 집계 범위 |
| `organization_members` | 구성원 (department, job_group) | 그룹핑/필터 |

---

## 4. 기간 필터

| 프리셋 | 기간 | 비교 기간 |
|--------|------|----------|
| 최근 7일 | 최근 7일 | 그 전 7일 |
| **최근 30일** (기본값) | 최근 30일 | 그 전 30일 |
| 이번 달 | 월 1일~오늘 | 전월 동일 구간 |
| 커스텀 | 사용자 지정 | 동일 길이 이전 구간 |

---

## 5. 화면 구성

### 5.1 상단: 기간 필터 + 요약 카드

```
┌─────────────────────────────────────────────────────────────┐
│  📊 인사이트              [최근 7일 ▼] [최근 30일] [커스텀]  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 총 투입  │  │ 활성     │  │ 완료     │  │ 활성     │   │
│  │ 1,240h   │  │ 구성원   │  │ 태스크   │  │ 보드     │   │
│  │ +12% ▲   │  │ 8/12명   │  │ 347건    │  │ 5개      │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**요약 카드 4개**:

| 카드 | 메트릭 | 산출 방식 |
|------|--------|----------|
| 총 투입 시간 | 시간(h) + 전기 대비 증감율 | `schedule_blocks` SUM(end_time - start_time) |
| 활성 구성원 | 활성/전체 | 기간 내 `activity_log` 1건+ 존재 구성원 수 |
| 완료 태스크 | 건수 | 기간 내 완료 상태 변경된 `tasks` 수 |
| 활성 보드 | 개수 | 기간 내 `activity_log` 1건+ 존재 보드 수 |

### 5.2 서브탭

요약 카드 아래에 두 개의 서브탭으로 나뉩니다:

```
[ 구성원별 ]  [ 보드별 ]
```

---

### 5.3 서브탭 A: 구성원별 기여 (Members View)

#### A-1. 구성원 기여도 테이블

```
┌────────────────────────────────────────────────────────────────┐
│  구성원별 기여                            [부서 전체 ▼] [검색]  │
├────────┬──────────┬────────┬────────┬─────────┬───────────────┤
│ 구성원 │ 투입시간 │ 완료   │ 활동   │ 주력보드│ 기여 분포     │
│        │          │ 태스크 │ 건수   │         │               │
├────────┼──────────┼────────┼────────┼─────────┼───────────────┤
│ 🟣김OO │ 186h     │ 42건   │ 156건  │ 프로덕트│ ████░░ 68%    │
│ 개발팀  │ +8% ▲   │        │        │         │ ██░░░░ 22%    │
│        │          │        │        │         │ █░░░░░ 10%    │
├────────┼──────────┼────────┼────────┼─────────┼───────────────┤
│ 🟢이OO │ 142h     │ 38건   │ 128건  │ 디자인  │ █████░ 85%    │
│ 디자인팀│ -3% ▼   │        │        │         │ █░░░░░ 15%    │
└────────┴──────────┴────────┴────────┴─────────┴───────────────┘
```

**컬럼 정의**:

| 컬럼 | 설명 | 데이터 소스 |
|------|------|------------|
| 구성원 | 프로필 이미지 + 이름 + 부서 (assignee color dot) | `organization_members` + `users` |
| 투입시간 | schedule_blocks 합산 시간 (전기 대비 증감) | `schedule_blocks` |
| 완료 태스크 | 기간 내 완료한 checklist_items 수 | `checklist_items` |
| 활동 건수 | activity_log 건수 (create/update/move/complete 등) | `activity_log` |
| 주력 보드 | 가장 많은 시간을 투입한 보드 이름 | `schedule_blocks` GROUP BY board |
| 기여 분포 | 보드별 시간 비율 미니 바 차트 (상위 3개 + 기타) | `schedule_blocks` GROUP BY board |

**필터/정렬**:
- 부서 필터 (드롭다운)
- 직군 필터 (드롭다운)
- 정렬: 투입시간순 / 완료순 / 활동순 (기본: 투입시간 내림차순)
- 검색: 이름 검색

#### A-2. 구성원 상세 드로어 (행 클릭 시)

```
┌──────────────────────────────────────────┐
│  김OO의 기여 상세            [최근 30일]  │
│  개발팀 · 풀스택 개발자                   │
├──────────────────────────────────────────┤
│                                          │
│  보드별 시간 투입 (Donut Chart)           │
│       ┌─────────┐                        │
│       │  68%    │  프로덕트 보드  126h    │
│       │ donut   │  디자인 보드     41h    │
│       │  chart  │  마케팅 보드     19h    │
│       └─────────┘                        │
│                                          │
│  주간 활동 추이 (Bar Chart)               │
│  ┌──────────────────────────┐            │
│  │ █ █ ██ █ ██ ███ █ ██ █  │            │
│  │ W1  W2  W3  W4          │            │
│  └──────────────────────────┘            │
│                                          │
│  보드별 상세                              │
│  ┌─────────────────────────┐             │
│  │ 📋 프로덕트 보드         │             │
│  │ 투입: 126h  완료: 28건   │             │
│  │ 주요 피처: 로그인 리팩토링 │             │
│  ├─────────────────────────┤             │
│  │ 🎨 디자인 보드           │             │
│  │ 투입: 41h   완료: 14건   │             │
│  │ 주요 피처: UI 개선        │             │
│  └─────────────────────────┘             │
└──────────────────────────────────────────┘
```

**상세 구성**:

| 섹션 | 내용 |
|------|------|
| 헤더 | 이름, 부서, 직책 |
| Donut Chart | 보드별 시간 비율 (Recharts PieChart) |
| 주간 추이 | 주 단위 투입시간 + 완료 태스크 (Recharts BarChart) |
| 보드별 카드 | 각 보드의 투입시간, 완료 건수, 상위 피처 |

---

### 5.4 서브탭 B: 보드별 리소스 투입 (Boards View)

#### B-1. 보드 리소스 카드 그리드

```
┌────────────────────────────────────────────────────────────┐
│  보드별 리소스 현황                         [정렬: 투입 ▼]  │
├────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐         │
│  │ 📋 프로덕트 보드     │  │ 🎨 디자인 보드       │         │
│  │                      │  │                     │         │
│  │ 총 투입: 480h        │  │ 총 투입: 320h       │         │
│  │ 기여자: 6명          │  │ 기여자: 4명         │         │
│  │ 완료 태스크: 142건   │  │ 완료 태스크: 89건   │         │
│  │ 피처 진행률: 68%     │  │ 피처 진행률: 45%    │         │
│  │                      │  │                     │         │
│  │ 투입 비중 ████████░  │  │ 투입 비중 █████░░░  │         │
│  │          38.7%       │  │          25.8%      │         │
│  │                      │  │                     │         │
│  │ Top 기여자           │  │ Top 기여자          │         │
│  │ 🟣김OO 126h (26%)   │  │ 🟢이OO 142h (44%)  │         │
│  │ 🟡박OO  98h (20%)   │  │ 🟣김OO  41h (13%)  │         │
│  │ 🔵최OO  87h (18%)   │  │ 🔴정OO  38h (12%)  │         │
│  └─────────────────────┘  └─────────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

**카드 항목**:

| 항목 | 설명 |
|------|------|
| 보드 이름 | 조직 소속 보드명 |
| 총 투입 시간 | schedule_blocks 합산 |
| 기여자 수 | 기간 내 활동한 구성원 수 |
| 완료 태스크 | 기간 내 완료 태스크 수 |
| 피처 진행률 | 전체 피처의 평균 진행률 |
| 투입 비중 | 조직 전체 시간 대비 해당 보드 비율 (Progress bar) |
| Top 기여자 | 시간 기준 상위 3명 (이름, 시간, 비율) |

#### B-2. 조직 전체 리소스 분배 차트

```
┌────────────────────────────────────────────────────────────┐
│  조직 리소스 분배                                          │
│                                                            │
│  ┌──────────────────────────────────────┐                  │
│  │            Treemap Chart              │                  │
│  │  ┌──────────────┬─────────┬────────┐ │                  │
│  │  │              │         │        │ │                  │
│  │  │  프로덕트    │ 디자인   │마케팅  │ │                  │
│  │  │   38.7%     │  25.8%  │ 19.2%  │ │                  │
│  │  │              │         │        │ │                  │
│  │  ├──────────────┴────┬────┴────────┤ │                  │
│  │  │    세일즈 10.1%    │  기타 6.2% │ │                  │
│  │  └───────────────────┴────────────┘ │                  │
│  └──────────────────────────────────────┘                  │
│                                                            │
│  주간 추이 (Stacked Area Chart)                            │
│  ┌──────────────────────────────────────┐                  │
│  │ ████████████████████████████████████ │ ← 프로덕트       │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← 디자인         │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← 마케팅         │
│  │ W1    W2    W3    W4    W5          │                  │
│  └──────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────┘
```

**차트 상세**:

| 차트 | 라이브러리 | 용도 |
|------|-----------|------|
| Treemap | Recharts `Treemap` | 보드별 리소스 비중 시각화 |
| Stacked Area | Recharts `AreaChart` | 주간 보드별 시간 투입 추이 |

---

## 6. API 설계

### 6.1 인사이트 요약

```
GET /api/v1/organizations/{orgId}/insights/summary
```

**Query Parameters**:

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `start_date` | `LocalDate` | O | 시작일 (yyyy-MM-dd) |
| `end_date` | `LocalDate` | O | 종료일 (yyyy-MM-dd) |

**Response** (API 클라이언트가 `data` 필드를 자동 언래핑하므로, 실제 응답은 래퍼 없이 반환):

```json
{
  "period": {
    "start_date": "2026-02-01",
    "end_date": "2026-02-26"
  },
  "total_work_minutes": 74400,
  "previous_total_work_minutes": 66400,
  "change_percentage": 12.0,
  "active_members": 8,
  "total_members": 12,
  "completed_tasks": 347,
  "active_boards": 5,
  "total_boards": 6
}
```

### 6.2 구성원별 기여

```
GET /api/v1/organizations/{orgId}/insights/members
```

**Query Parameters**:

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `start_date` | `LocalDate` | O | 시작일 |
| `end_date` | `LocalDate` | O | 종료일 |
| `department_id` | `String` | X | 부서 필터 |
| `job_group_id` | `String` | X | 직군 필터 |
| `sort_by` | `String` | X | 정렬 기준 (기본: `work_minutes`) |
| `sort_dir` | `String` | X | 정렬 방향 (기본: `desc`) |

**sort_by 옵션**: `work_minutes`, `completed_tasks`, `activity_count`

**Response** (ListResponse 래퍼):

```json
{
  "members": [
    {
      "member": {
        "id": "uuid-1",
        "user_id": "uuid-10",
        "name": "김OO",
        "profile_image": "https://...",
        "department": "개발팀",
        "job_group": "엔지니어링",
        "job_title": "풀스택 개발자"
      },
      "total_work_minutes": 11160,
      "previous_work_minutes": 10333,
      "change_percentage": 8.0,
      "completed_tasks": 42,
      "activity_count": 156,
      "primary_board": {
        "id": "uuid-5",
        "name": "프로덕트 보드"
      },
      "board_breakdown": [
        {
          "board_id": "uuid-5",
          "board_name": "프로덕트 보드",
          "work_minutes": 7560,
          "percentage": 67.7
        },
        {
          "board_id": "uuid-8",
          "board_name": "디자인 보드",
          "work_minutes": 2460,
          "percentage": 22.0
        },
        {
          "board_id": "uuid-12",
          "board_name": "마케팅 보드",
          "work_minutes": 1140,
          "percentage": 10.3
        }
      ]
    }
  ]
}
```

### 6.3 구성원 상세 기여

```
GET /api/v1/organizations/{orgId}/insights/members/{memberId}
```

**Query Parameters**:

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `start_date` | `LocalDate` | O | 시작일 |
| `end_date` | `LocalDate` | O | 종료일 |

**Response**:

> **구현 노트**: `top_features.work_minutes`는 피처 단위 시간 블록 추적이 미구현이므로 현재 `0`으로 반환됩니다. `weekly_trend.completed_tasks`도 주 단위 별도 쿼리가 필요하여 `0`으로 반환됩니다.

```json
{
  "member": {
    "id": "uuid-1",
    "name": "김OO",
    "profile_image": "https://...",
    "department": "개발팀",
    "job_group": "엔지니어링",
    "job_title": "풀스택 개발자"
  },
  "total_work_minutes": 11160,
  "completed_tasks": 42,
  "activity_count": 156,
  "board_details": [
    {
      "board_id": "uuid-5",
      "board_name": "프로덕트 보드",
      "work_minutes": 7560,
      "completed_tasks": 28,
      "top_features": [
        {
          "id": "uuid-20",
          "title": "로그인 리팩토링",
          "work_minutes": 0
        },
        {
          "id": "uuid-22",
          "title": "대시보드 개선",
          "work_minutes": 0
        }
      ]
    },
    {
      "board_id": "uuid-8",
      "board_name": "디자인 보드",
      "work_minutes": 2460,
      "completed_tasks": 14,
      "top_features": [
        {
          "id": "uuid-35",
          "title": "UI 개선",
          "work_minutes": 0
        }
      ]
    }
  ],
  "weekly_trend": [
    {
      "week_start": "2026-02-03",
      "work_minutes": 2400,
      "completed_tasks": 0
    },
    {
      "week_start": "2026-02-10",
      "work_minutes": 3100,
      "completed_tasks": 0
    },
    {
      "week_start": "2026-02-17",
      "work_minutes": 3200,
      "completed_tasks": 0
    },
    {
      "week_start": "2026-02-24",
      "work_minutes": 2460,
      "completed_tasks": 0
    }
  ]
}
```

### 6.4 보드별 리소스

```
GET /api/v1/organizations/{orgId}/insights/boards
```

**Query Parameters**:

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `start_date` | `LocalDate` | O | 시작일 |
| `end_date` | `LocalDate` | O | 종료일 |
| `sort_by` | `String` | X | 정렬 기준 (기본: `work_minutes`) |

**sort_by 옵션**: `work_minutes`, `contributor_count`, `completed_tasks`

**Response**:

```json
{
  "boards": [
    {
      "board": {
        "id": "uuid-5",
        "name": "프로덕트 보드",
        "owner_name": "김OO"
      },
      "total_work_minutes": 28800,
      "org_share_percentage": 38.7,
      "contributor_count": 6,
      "completed_tasks": 142,
      "feature_progress": 68.0,
      "top_contributors": [
        {
          "member_id": "uuid-1",
          "name": "김OO",
          "profile_image": "https://...",
          "work_minutes": 7560,
          "percentage": 26.3
        },
        {
          "member_id": "uuid-3",
          "name": "박OO",
          "profile_image": "https://...",
          "work_minutes": 5880,
          "percentage": 20.4
        },
        {
          "member_id": "uuid-7",
          "name": "최OO",
          "profile_image": "https://...",
          "work_minutes": 5220,
          "percentage": 18.1
        }
      ],
      "weekly_trend": [
        { "week_start": "2026-02-03", "work_minutes": 6800 },
        { "week_start": "2026-02-10", "work_minutes": 7200 },
        { "week_start": "2026-02-17", "work_minutes": 8100 },
        { "week_start": "2026-02-24", "work_minutes": 6700 }
      ]
    }
  ],
  "resource_distribution": {
    "total_work_minutes": 74400,
    "weekly_trend": [
      {
        "week_start": "2026-02-03",
        "boards": [
          { "board_id": "uuid-5", "board_name": "프로덕트", "work_minutes": 6800 },
          { "board_id": "uuid-8", "board_name": "디자인", "work_minutes": 4500 },
          { "board_id": "uuid-12", "board_name": "마케팅", "work_minutes": 3200 }
        ]
      }
    ]
  }
}
```

---

## 7. 백엔드 구현

### 7.1 파일 구조

```
backend/src/main/java/com/kanban/domain/organization/
├── controller/
│   └── OrgInsightsController.java          # API 엔드포인트 4개
├── service/
│   └── OrgInsightsService.java             # 집계 로직
└── dto/
    ├── OrgInsightsSummaryResponse.java      # 요약 응답
    ├── OrgMemberContributionResponse.java   # 구성원별 목록 응답
    ├── OrgMemberDetailResponse.java         # 구성원 상세 응답
    └── OrgBoardResourceResponse.java        # 보드별 응답
```

### 7.2 컨트롤러

```java
@RestController
@RequestMapping("/api/v1/organizations/{orgId}/insights")
@RequiredArgsConstructor
public class OrgInsightsController {

    private final OrgInsightsService insightsService;

    @GetMapping("/summary")
    public ResponseEntity<?> getSummary(
            @PathVariable String orgId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) { ... }

    @GetMapping("/members")
    public ResponseEntity<?> getMemberContributions(
            @PathVariable String orgId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String departmentId,
            @RequestParam(required = false) String jobGroupId,
            @RequestParam(defaultValue = "work_minutes") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir,
            @AuthenticationPrincipal UserPrincipal principal) { ... }

    @GetMapping("/members/{memberId}")
    public ResponseEntity<?> getMemberDetail(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) { ... }

    @GetMapping("/boards")
    public ResponseEntity<?> getBoardResources(
            @PathVariable String orgId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "work_minutes") String sortBy,
            @AuthenticationPrincipal UserPrincipal principal) { ... }
}
```

### 7.3 핵심 쿼리 전략

기존 `StatisticsService`의 보드 단위 집계 로직을 참고하되, 조직 소속 보드들을 배치로 집계합니다.

```java
@Service
@RequiredArgsConstructor
public class OrgInsightsService {

    public OrgInsightsSummaryResponse getSummary(String orgId, LocalDate start, LocalDate end, String userId) {
        // 0. 권한 검증 (MEMBER 이상)
        OrganizationMember member = orgMemberRepository.findByOrgIdAndUserId(orgId, userId);

        // 1. 조직 보드 ID 목록 조회
        List<String> boardIds = boardRepository.findBoardIdsByOrgId(orgId);

        // 2. schedule_blocks에서 시간 합산
        Long totalMinutes = scheduleBlockRepository
            .sumMinutesByBoardIdsAndDateRange(boardIds, start, end);

        // 3. 이전 동일 기간 비교
        int days = (int) ChronoUnit.DAYS.between(start, end);
        LocalDate prevStart = start.minusDays(days);
        LocalDate prevEnd = end.minusDays(days);
        Long prevMinutes = scheduleBlockRepository
            .sumMinutesByBoardIdsAndDateRange(boardIds, prevStart, prevEnd);

        // 4. 활성 구성원 (activity_log 기반 — LocalDateTime 사용)
        Long activeMembers = activityLogRepository
            .countDistinctUsersByBoardIdsAndDateRange(boardIds,
                start.atStartOfDay(), end.plusDays(1).atStartOfDay());

        // 5. 완료 태스크
        Long completedTasks = taskRepository
            .countCompletedByBoardIdsAndDateRange(boardIds, start, end);

        // 6. 활성 보드
        Long activeBoards = activityLogRepository
            .countDistinctBoardsByBoardIdsAndDateRange(boardIds,
                start.atStartOfDay(), end.plusDays(1).atStartOfDay());

        return OrgInsightsSummaryResponse.of(start, end, ...);
    }
}
```

### 7.4 필요한 Repository 쿼리 추가

| Repository | 메서드 | 용도 |
|-----------|--------|------|
| `BoardRepository` | `findBoardIdsByOrgId(String orgId)` | 조직 보드 ID 목록 |
| `ScheduleBlockRepository` | `sumMinutesByBoardIdsAndDateRange(List<String>, LocalDate, LocalDate)` | 총 투입 시간 |
| `ScheduleBlockRepository` | `sumMinutesGroupByUserAndBoard(List<String>, LocalDate, LocalDate)` | 구성원×보드 매트릭스 |
| `ScheduleBlockRepository` | `sumMinutesGroupByBoardAndDate(List<String>, LocalDate, LocalDate)` | 보드별 일자별 시간 (서비스에서 주 집계) |
| `ScheduleBlockRepository` | `sumMinutesGroupByUserAndDate(List<String>, LocalDate, LocalDate)` | 구성원별 일자별 시간 (서비스에서 주 집계) |
| `TaskRepository` | `countCompletedByBoardIdsAndDateRange(List<String>, LocalDate, LocalDate)` | 완료 태스크 집계 |
| `ChecklistItemRepository` | `countCompletedByAssigneeAndBoardIds(String, List<String>)` | 구성원별 완료 건수 |
| `ActivityLogRepository` | `countByUserAndBoardIdsAndDateRange(String, List<String>, LocalDateTime, LocalDateTime)` | 활동 건수 |
| `ActivityLogRepository` | `countDistinctUsersByBoardIdsAndDateRange(List<String>, LocalDateTime, LocalDateTime)` | 활성 구성원 수 |
| `ActivityLogRepository` | `countDistinctBoardsByBoardIdsAndDateRange(List<String>, LocalDateTime, LocalDateTime)` | 활성 보드 수 |
| `FeatureRepository` | `findAvgProgressByBoardId(String)` | 보드 피처 진행률 |

> **구현 노트**:
> - 모든 엔티티 ID는 `String` (UUID) 타입
> - `ActivityLogRepository` 쿼리는 `createdAt`이 `LocalDateTime`이므로 파라미터도 `LocalDateTime` 사용
> - 보드 ID 조회는 기존 `BoardRepository`에 쿼리 추가 (별도 `OrgBoardRepository` 미생성)
> - `sumMinutesGroupByBoardAndDate`/`sumMinutesGroupByUserAndDate`는 일자별 데이터 반환 → 서비스 레이어에서 `date.with(DayOfWeek.MONDAY)` 주 집계

---

## 8. 프론트엔드 구현

### 8.1 파일 구조

```
frontend/src/app/components/organization/tabs/
├── OrgInsightsTab.tsx                    # 메인 탭 컴포넌트
└── insights/
    ├── InsightsSummaryCards.tsx           # 상단 요약 카드 4개
    ├── InsightsPeriodFilter.tsx           # 기간 필터 (프리셋 + 커스텀)
    ├── MembersContributionView.tsx        # 구성원별 테이블 + 필터
    ├── MemberContributionDetailDrawer.tsx # 구성원 상세 (Donut + Bar + 보드 카드)
    ├── BoardsResourceView.tsx            # 보드별 카드 그리드
    └── ResourceDistributionChart.tsx      # Treemap + Stacked Area 차트
```

### 8.2 TypeScript 인터페이스

```typescript
// API Response Types (snake_case, ID는 모두 string/UUID)
interface OrgInsightsSummary {
  period: { start_date: string; end_date: string };
  total_work_minutes: number;
  previous_total_work_minutes: number;
  change_percentage: number;
  active_members: number;
  total_members: number;
  completed_tasks: number;
  active_boards: number;
  total_boards: number;
}

interface OrgMemberContribution {
  member: {
    id: string;
    user_id: string;
    name: string;
    profile_image: string | null;
    department: string | null;
    job_group: string | null;
    job_title: string | null;
  };
  total_work_minutes: number;
  previous_work_minutes: number;
  change_percentage: number;
  completed_tasks: number;
  activity_count: number;
  primary_board: { id: string; name: string } | null;
  board_breakdown: {
    board_id: string;
    board_name: string;
    work_minutes: number;
    percentage: number;
  }[];
}

interface OrgMemberContributionDetail {
  member: { id: string; name: string; profile_image: string | null; department: string | null; job_title: string | null };
  total_work_minutes: number;
  completed_tasks: number;
  activity_count: number;
  board_details: {
    board_id: string;
    board_name: string;
    work_minutes: number;
    completed_tasks: number;
    top_features: { id: string; title: string; work_minutes: number }[];
  }[];
  weekly_trend: {
    week_start: string;
    work_minutes: number;
    completed_tasks: number;
  }[];
}

interface OrgBoardResource {
  board: { id: string; name: string; owner_name: string };
  total_work_minutes: number;
  org_share_percentage: number;
  contributor_count: number;
  completed_tasks: number;
  feature_progress: number;
  top_contributors: {
    member_id: string;
    name: string;
    profile_image: string | null;
    work_minutes: number;
    percentage: number;
  }[];
  weekly_trend: { week_start: string; work_minutes: number }[];
}

// 보드 리소스 API 전체 응답 (ListResponse 래퍼)
interface OrgBoardResourceResponse {
  boards: OrgBoardResource[];
  resource_distribution: {
    total_work_minutes: number;
    weekly_trend: {
      week_start: string;
      boards: { board_id: string; board_name: string; work_minutes: number }[];
    }[];
  };
}
```

### 8.3 차트 라이브러리

기존 프로젝트의 `Recharts` 활용:

| 차트 | Recharts 컴포넌트 | 용도 |
|------|-------------------|------|
| Donut | `PieChart` + `Pie` (innerRadius) | 구성원 보드별 시간 분포 |
| Bar | `BarChart` + `Bar` | 주간 활동 추이 |
| Treemap | `Treemap` | 조직 리소스 분배 시각화 |
| Stacked Area | `AreaChart` + `Area` (stackId) | 주간 보드별 시간 추이 |

### 8.4 디자인 스타일

Organization 탭 패턴 (`dark:` 기반)을 따릅니다:

```tsx
// 요약 카드
<div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-5">
  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
    {label}
  </span>
  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
    {formattedValue}
  </p>
  <span className={`text-[11px] font-bold ${
    isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400'
  }`}>
    {changePercent}% {isPositive ? '▲' : '▼'}
  </span>
</div>

// 서브탭 버튼
<button className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
  active
    ? 'bg-bridge-accent text-white'
    : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
}`}>
  {label}
</button>

// 테이블 행
<tr className="border-b border-black/5 dark:border-white/5
  hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors">
  ...
</tr>

// 보드 카드
<div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-6
  hover:border-bridge-accent/30 transition-all">
  ...
</div>
```

---

## 9. i18n 키

```json
{
  "organization": {
    "insights": {
      "title": "인사이트",
      "period": {
        "last7": "최근 7일",
        "last30": "최근 30일",
        "thisMonth": "이번 달",
        "custom": "커스텀"
      },
      "summary": {
        "totalHours": "총 투입 시간",
        "activeMembers": "활성 구성원",
        "completedTasks": "완료 태스크",
        "activeBoards": "활성 보드",
        "vsLastPeriod": "전기 대비"
      },
      "tabs": {
        "members": "구성원별",
        "boards": "보드별"
      },
      "members": {
        "title": "구성원별 기여",
        "workHours": "투입시간",
        "completedTasks": "완료 태스크",
        "activityCount": "활동 건수",
        "primaryBoard": "주력 보드",
        "distribution": "기여 분포",
        "allDepartments": "부서 전체",
        "allJobGroups": "직군 전체",
        "sortByHours": "투입시간순",
        "sortByTasks": "완료순",
        "sortByActivity": "활동순",
        "search": "이름 검색",
        "detail": {
          "title": "{{name}}의 기여 상세",
          "boardBreakdown": "보드별 시간 투입",
          "weeklyTrend": "주간 활동 추이",
          "boardDetails": "보드별 상세",
          "topFeatures": "주요 피처",
          "hours": "시간",
          "tasks": "태스크"
        }
      },
      "boards": {
        "title": "보드별 리소스 현황",
        "totalHours": "총 투입",
        "contributors": "기여자",
        "completedTasks": "완료 태스크",
        "featureProgress": "피처 진행률",
        "orgShare": "투입 비중",
        "topContributors": "Top 기여자",
        "resourceDistribution": "조직 리소스 분배",
        "weeklyTrend": "주간 추이",
        "sortByHours": "투입순",
        "sortByContributors": "기여자순",
        "sortByTasks": "완료순"
      },
      "noData": "선택한 기간에 데이터가 없습니다.",
      "memberOnly": "본인의 기여 현황만 확인할 수 있습니다."
    }
  }
}
```

---

## 10. 구현 우선순위

| Phase | 항목 | 범위 | 난이도 | 상태 |
|-------|------|------|--------|------|
| **P1** | 요약 카드 4개 (Summary API + UI) | BE + FE | 중 | ✅ 완료 |
| **P1** | 구성원별 기여 테이블 (Members API + 테이블) | BE + FE | 중 | ✅ 완료 |
| **P1** | 보드별 리소스 카드 (Boards API + 카드 그리드) | BE + FE | 중 | ✅ 완료 |
| **P2** | 구성원 상세 드로어 (Detail API + Donut/Bar 차트) | BE + FE | 중 | ✅ 완료 |
| **P2** | 리소스 분배 차트 (Treemap + Stacked Area) | FE | 중 | ✅ 완료 |
| **P2** | 기간 프리셋 + 커스텀 날짜 선택기 | FE | 낮 | ✅ 완료 |
| **P3** | 부서별/직군별 그룹핑 필터 | FE | 낮 | ✅ 완료 (P1에 포함) |
| **P3** | MEMBER 역할 본인만 보기 제한 | BE + FE | 낮 | ✅ 완료 (P1에 포함) |
| **P3** | CSV/Excel 내보내기 | BE + FE | 낮 | ❌ 미구현 |

---

## 11. 성능 고려사항

| 항목 | 전략 |
|------|------|
| 대량 데이터 집계 | JPQL 집계 쿼리 사용 (애플리케이션 단 루프 최소화) |
| N+1 방지 | 보드 ID 목록 한 번에 IN 절로 조회 |
| 캐싱 | Redis 캐시 (TTL 5분) - 동일 기간 반복 조회 시 (향후 적용) |
| 주간 추이 | 애플리케이션 레벨 주간 집계 — `date.with(DayOfWeek.MONDAY)` 그룹핑 (H2/PostgreSQL 호환) |
| 응답 크기 | Top N 제한 (Top 기여자 3명, Top 피처 3개) |
| 시간 계산 | JPQL `HOUR()/MINUTE()` 함수로 분 단위 계산 (H2+PostgreSQL 호환) |

> **변경 사유**: 기존 `DATE_TRUNC('week', ...)` 방식은 PostgreSQL 전용 함수로, H2 로컬 환경과 호환되지 않습니다.
> DB에서 일자별 데이터를 반환하고 서비스 레이어에서 `date.with(DayOfWeek.MONDAY)` 기준으로 주 단위 집계합니다.

---

## 12. 향후 확장 가능성

| 기능 | 설명 |
|------|------|
| 부서별 대시보드 | 부서 단위 집계 뷰 |
| 알림/리포트 | 주간 인사이트 자동 요약 (AI + 이메일) |
| 목표 설정 | 보드별/구성원별 시간 목표 및 달성률 |
| 비교 뷰 | 기간 간 또는 부서 간 비교 |
| 실시간 위젯 | 대시보드 탭에 인사이트 요약 위젯 추가 |
| CSV/Excel 내보내기 | 인사이트 데이터 다운로드 (P3 미구현) |
| 피처별 시간 추적 | `top_features.work_minutes` 실제 데이터 집계 |
| 주간 완료 태스크 | `weekly_trend.completed_tasks` 주별 쿼리 구현 |

---

## 13. 구현 변경 이력

### v1.0.0 → v1.1.0 (2026-02-26)

| 항목 | 기획서 (v1.0.0) | 실제 구현 (v1.1.0) | 사유 |
|------|-----------------|-------------------|------|
| 탭 아이콘 | `BarChart3` | `TrendingUp` | Dashboard 탭이 이미 `BarChart3` 사용 |
| 엔티티 ID 타입 | `Long` | `String` (UUID) | 프로젝트 전체 엔티티가 String UUID 사용 |
| 응답 래퍼 | `{ "data": {...} }` | 래퍼 없음 (raw DTO) | API 클라이언트가 `data` 자동 언래핑 |
| 보드 ID 조회 | `OrgBoardRepository` | `BoardRepository`에 쿼리 추가 | 기존 Repository 활용, 별도 생성 불필요 |
| 주간 집계 | DB `DATE_TRUNC('week', ...)` | 앱 레벨 `DayOfWeek.MONDAY` 그룹핑 | H2 로컬 환경 호환성 |
| ActivityLog 쿼리 파라미터 | `LocalDate` | `LocalDateTime` | `createdAt` 필드가 `LocalDateTime` |
| `top_features.work_minutes` | 실제 피처별 시간 | `0` (미구현) | 피처 단위 시간 블록 추적 미구현 |
| `weekly_trend.completed_tasks` | 주별 완료 태스크 | `0` (미구현) | 주 단위 별도 쿼리 필요 |
| P3 필터/권한 | P3 우선순위 | P1에 포함 구현 | 부서/직군 필터 + MEMBER 제한 함께 구현 |
