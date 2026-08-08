# 스프린트 뷰 개념 UX — 구현 계획

시안: `docs/Design/concept-ux-prototype.html`
작성 기준: 2026-08-08, 브랜치 `develop`

---

## 0. 확정된 결정

| 항목 | 결정 |
|---|---|
| Task 담당자 | **추가하지 않는다.** 담당은 `checklist_items.assignee_id`에만. 구성원 뷰에서 카드가 여러 컬럼에 서는 것도 사양으로 유지 |
| 블록(Block) | 사용자 개념에서 제거. 단, **테이블 삭제가 아니라 JIRA 전용 내부 구조로 강등** (§1.3) |
| 날짜 | 직접 입력은 마일스톤 · 스프린트 · 체크리스트 3층. 피처는 제거, 태스크는 파생 |
| 스프린트 컬럼 | START/MIDDLE/END 3종과 커스텀 컬럼 기능은 **그대로 유지**. 손대지 않는다 |

---

## 1. 설계상 가장 중요한 결정 3개

이 셋을 잘못 잡으면 나머지가 전부 비싸진다.

### 1.1 "파생"을 읽기 시점 계산이 아니라 **쓰기 시점 동기화**로 한다

태스크 날짜를 응답에서 계산해 내리면 `task.start_date`를 읽는 소비처를 전부 고쳐야 한다. 확인된 소비처만:

- `WeeklyScheduleView.tsx` (간트) — `start_date`/`due_date`/`baseline_*` 를 105·333·453·684·724·871·939·1558행에서 사용
- `CalendarView.tsx`, `DailyScheduleView.tsx`, `TaskDetailModal.tsx`, `KanbanCard.tsx`, `ChecklistStatusBoard.tsx` 등

**따라서 컬럼은 그대로 두고, 담기·이월 시점에 서버가 값을 채워 넣는다.**

```
sprintService.addTask()   → date_override=false 인 태스크의 start_date/due_date := 스프린트 기간
sprintService.closeSprint() 이월 → 다음 스프린트 기간으로 재동기화
milestone 기간 변경        → 해당 마일스톤 소속 미담김 태스크 재동기화
```

소비처는 **한 줄도 고칠 필요가 없다.** UI에서 바뀌는 건 "입력칸이 사라지고 배지가 생긴다" 뿐이다.

### 1.2 `ui_level`은 신규만 1, 기존은 전부 3으로 백필한다

복잡도 게이팅을 켜는 순간 기존 사용자 화면에서 탭이 사라지면 사고다. 마이그레이션에서 **기존 보드 전부 `ui_level=3`**, 이후 생성되는 보드만 `1`. 온보딩을 마치면 `2`로 승급.

### 1.3 블록은 지우는 게 아니라 **JIRA 전용으로 강등**한다

`grep` 결과 JIRA 연동이 블록에 정면으로 묶여 있다:

- `BlockStatusMap` — `blockId → {jira_status_id, dir, qa, return_block_id}` JSON 매핑
- `Block.jiraStatusId` — 미러 컬럼 표식
- `JiraIntegrationConfig:97`, `JiraRequest:37`, `JiraResponse:102-103`

`blocks` 테이블을 드롭하면 JIRA 연동이 통째로 깨진다. 그래서 최종 목표는:

- 사용자에게 보이는 블록 UI(칸반 서브탭, 블록 이동, 블록 관리) = **제거**
- `blocks` 테이블 = **JIRA 미러 컬럼 저장소로 축소**, 일반 블록 행은 정리
- `tasks.block_id` = nullable → JIRA 연동 태스크만 값을 가짐

한편 태스크 생성 시 블록은 이미 자동 할당된다(`TaskService:207`, `FixedBlockType.TASK`). 사용자가 블록을 고르는 경로는 **칸반에서 카드를 옮길 때뿐**(`TaskRequest.Move.targetBlockId @NotNull`). 즉 제거 표면이 생각보다 작다.

---

## 2. PR 계획 — 6개, 각각 독립 배포 가능

### PR1 — 카드 표기 정리 (FE only · 1일) ✅ 완료

**목표:** 카드 하나가 말하는 숫자를 4개에서 1개로.

**한 일** — `frontend/src/app/components/SprintBoard.tsx` (+68 −57)

| 대상 | 전 | 후 |
|---|---|---|
| 카드 게이지 | `2/2 · 전체 23/24` | `내 몫 2/2` — `· 전체 N/M` 병기 삭제 |
| 카드 푸터 | `담당 외 21개` 토글 버튼 | `함께 3명` + 아바타 스택(최대 3 + `+N`) |
| 상태 | `scopeAllCards` / `toggleCardScopeAll` / `showOthers` / `otherCount` | 전부 제거 |
| 펼침 | 펼치면 남의 줄까지 노출 가능 | 항상 내 몫만. 남의 줄은 상세(↗)에서 |
| `showLineOwner` | `expanded && (!scoped \|\| showOthers)` | `expanded && !scoped` |

컬럼 헤더는 손대지 않았다 — 확인 결과 이미 `lineOwnedBy`로 그 사람 몫만 세고 있었다(`SprintBoard.tsx:1287-1295`).

**i18n:** 새 문구가 "내 몫" · "함께 N명" 둘뿐이고 기존 카드 문구들도 하드코딩 상태라 이번엔 맞춰서 하드코딩. i18n 이관은 별도 정리 과제.

**검증:** 타입 에러 증가 0 (프로젝트 기준선 142개 → 142개, `SprintBoard.tsx`의 기존 2건 외 신규 없음). 빌드 통과.
브라우저 확인은 **못 했다** — 체크리스트 담당자가 여러 명인 스프린트 보드가 필요해서 dev 보드에서 눈으로 봐야 한다.

**리스크:** 낮음. 되돌리기는 리버트 한 번.

---

### PR2 — 기간 출처 표식 (FE only · 0.5일) ✅ 완료

> **착수 후 축소.** 원안은 "브레드크럼 + 기간 배지 + 백엔드 파생 필드 3개"였으나 실제 화면을 보고 둘을 뺐다.
>
> - **브레드크럼 제외** — 카드에 이미 피처 칩이 있고(`SprintBoard.tsx:2313-2323`), 마일스톤은 상단 탭, 주기는 스프린트 헤더에 있다. 시안에서 브레드크럼이 필요했던 건 그 목업이 상단 탭을 다 지운 화면이었기 때문이고, 실제 화면에서는 같은 정보를 세 번 그리는 셈이다.
> - **백엔드 변경 제외** — `SprintInfo.start_date/end_date`와 `SprintItemCard.start_date/due_date`가 이미 응답에 있다. 파생을 서버에서 계산하면 `TaskResponse.from()`이 `task.getSprint()`를 태스크마다 lazy 로딩해 N+1이 난다. 클라이언트에서 비교하면 공짜다.

**한 일** — `SprintBoard.tsx` `renderCard`

| 상태 | 표시 |
|---|---|
| 담김 + 자기 날짜 없음 | `📅 7/27 ~ 8/14` (teal) · 툴팁 "Sprint 3에서 상속" ← **지금까지 아무것도 안 보이던 자리** |
| 담김 + 날짜가 주기와 동일 | 기존 D-day 칩 그대로 |
| 담김 + 날짜가 주기와 다름 | `✎` 앰버 표식 + 툴팁 "직접 지정 · Sprint 3은 7/27~8/14" |
| 완료 · 미담김 | 변화 없음 |

판정은 `날짜 없음 || (start==sprint.start && due==sprint.end)` → 상속, 아니면 직접 지정. **PR4에서 `tasks.date_override`가 생기면 이 추정을 플래그로 교체한다.**

**부수 효과:** ✎ 표식이 붙은 카드 수가 곧 PR4 백필에서 `date_override=true`가 될 후보다. 별도 계측 없이 눈으로 관측된다.

---

### PR3 — 레벨 게이팅 + 기능 서랍 (BE + FE · 5일)

설계안: `docs/Design/level-model.html` · `docs/Design/level-onboarding-plan.html`

> **원안에서 구조가 바뀌었다.** `ui_level` 숫자 하나로 가려 했으나 두 가지가 드러났다.
> ① 개별로 켜고 끌 수 있어야 하는 것들이 있다(구성원 뷰·시간 블록·리뷰·JIRA).
> ② 그것들은 **레벨 축이 아니다** — 1단계도 여럿이 쓰는 도구이므로 구성원 뷰는 1단계부터 있어야 한다.
> 그래서 저장을 둘로 나눈다.

#### 모델

**레벨 = 시간을 몇 겹으로 묶는가.** 이 축 하나만 사다리다.

| 레벨 | 시간 묶음 | 생기는 것 |
|---|---|---|
| 1 | 0겹 | 묶음 컬럼 + 카드 + 할 일. 마감·담기 없음 |
| 2 | 1겹 | 주기 — 담기 / 기간 상속 / 주기 종료 / 이월 / 백로그 레일 |
| 3 | 2겹 | 단계 — 마일스톤 탭 / 단계 진행률 / 로드맵·간트 |

**레벨과 무관하게 항상 있는 것** (게이팅 대상 아님)

- `묶음 ▸ 작업 ▸ 할 일` 구조, 담당자는 할 일 줄에
- **흐름 컬럼** — 묶음/구성원 컬럼 뒤에 `In Review` · `Done`.
  `SprintBoard.tsx:4682` 주석대로 START 컬럼만 그룹 기준에 따라 쪼개지고 나머지는 공유된다.
  `Done`은 끌 수 없다 — 끝난 일이 갈 곳이 없으면 컬럼이 무한정 길어진다.

**직교 옵션** (레벨과 무관, 1·2·3 어디서나)

| 키 | 이름 | 기본 |
|---|---|---|
| `members` | 구성원별 보기 | 켬 |
| `review` | In Review 컬럼 | 켬 |
| `timeblock` | 개인 시간 블록 | 켬 |
| `jira` | JIRA 연동 | 연동 시 |

#### 스키마 — `V{ts}__add_boards_ui_level_options.sql`

```sql
DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN ui_level SMALLINT NOT NULL DEFAULT 3;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN ui_options VARCHAR(255) NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_boards_ui_level') THEN
        ALTER TABLE boards ADD CONSTRAINT ck_boards_ui_level CHECK (ui_level BETWEEN 1 AND 3);
    END IF;
END $$;

-- 기존 보드는 지금 화면 그대로 — 최고 레벨 + 전 옵션.
UPDATE boards SET ui_level = 3 WHERE ui_level IS NULL;
UPDATE boards SET ui_options = 'members,review,timeblock,jira' WHERE ui_options = '';
```

**기본값 3이 핵심이다.** 게이팅을 켜는 순간 기존 사용자 화면에서 탭이 사라지면 사고다.
신규 보드만 애플리케이션에서 1로 생성한다.

**마일스톤 데이터는 손대지 않는다.** 보드 생성 시 기본 마일스톤이 이미 자동 생성되고(`Milestone.isDefault`),
1·2단계에서는 그 하나를 말없이 계속 쓰며 화면에만 안 보인다. 3단계 승급 = 이름 붙이고 쪼개기.
**승급에 스키마 변경이 없다.**

#### 조각

| 순서 | 조각 | 내용 | 비용 |
|---|---|---|---|
| 3a ✅ | 스키마 + 엔티티 + API | `Board.uiLevel/uiOptions`, `UiOption` enum, `Detail`·`Full` 응답, `PATCH /boards/{id}/ui-config` | 0.5일 |
| 3b ✅ | FE 훅 | `useBoardFeatures(board)` → `{ level, has(opt), showSprint/Milestone/Backlog/TaskPeriod }` | 0.5일 |
| 3c ✅ | 게이팅 적용 | 마일스톤 서브탭·주기 타임라인·구성원 전환·기간 배지·리뷰 컬럼·JIRA 탭 + **레벨 1 백로그 자동 담기(BE)** | 1일 |
| 3d ✅ | 기능 서랍 | `FeatureDrawer.tsx` — 레벨 라디오 + 옵션 스위치. 서브탭 옆 `⚙ 기능` 버튼 | 0.5일 |
| 3e ✅ | 유령 슬롯 | `FeatureGhost` + `useFeatureGhosts` — 동시 2개·선행조건·영구해제(보드별 localStorage). 배치: 단계·주기(서브탭 줄), 구성원(스프린트 헤더) | 1일 |
| 3f ✅ | 보드 생성 3택 | `CreateBoardModal`에 "이 팀은 일을 어떻게 굴리나요?" 3택. 생성 후 `ui-config` PATCH(레벨 1이면 왕복 생략) | 0.5일 |
| 3h ✅ | 리뷰 유령 컬럼 | `FeatureGhost variant="column"` — 숨긴 MIDDLE 자리에 인라인 유령 컬럼(첫 번째 것만) | 0.5일 |
| 3g ✅ | 승급 마법사 | `LevelUpWizard` — 1→2 카드 고르기+기간, 2→3 단계 이름+기간. **주기를 여러 단계로 쪼개는 건 제외**(§아래) | 1일 |

#### 착수 중 드러난 것 — `sprintEnabled`는 더 이상 사용자 개념이 아니다

`getSprintBoard`는 `milestone.sprintEnabled`가 true일 때만 컬럼·스프린트를 프로비저닝했다.
그런데 **흐름 컬럼(In Review·Done)이 SprintColumn**이므로, 레벨 1에도 흐름이 있어야 한다는 결론과 충돌한다 —
sprintEnabled=false면 컬럼이 아예 없어 보드가 빈 화면이 된다.

그래서 셋을 바꿨다.

1. **레벨 1도 프로비저닝한다** — `uiLevel <= 1`이면 sprintEnabled와 무관하게 `ensureColumns` + `ensureActiveSprint`.
2. **레벨 1은 백로그를 자동으로 흡수한다** — `adoptBacklogForLevelOne()`. 레벨 1엔 백로그 레일이 없으므로
   그냥 두면 사용자가 만든 태스크가 어디에도 안 보인다. 보드를 열 때마다 멱등하게 START 컬럼으로 끌어올린다.
3. **`sprintEnabled`는 내부 값으로 강등** — 사용자에게 보이는 시간 축 스위치는 `boards.ui_level` 하나뿐이다.
   기존 `toggleSprintMode(false)`는 스프린트를 **삭제**하므로 레벨 강등 경로로 쓰지 않는다(데이터 보존 원칙 위반).

**3d를 3e보다 먼저 한다.** 켤 방법 없이 끄기만 넣으면 기능을 숨긴 게 아니라 없앤 것이다.

#### 3h에서 배운 것 — 컬럼 줄에서는 팝오버를 못 쓴다

보드 컬럼 줄의 스크롤 컨테이너가 `overflow-x-auto`인데, CSS 규칙상 한 축이 `auto`면
다른 축의 `visible`도 `auto`로 계산된다 — 즉 **y축도 잘린다**. 컬럼 안에 절대배치 팝오버를 띄우면 잘려 보인다.

그래서 유령에 변형을 하나 더 뒀다.
 · `chip`   — 점선 칩 + 팝오버. 툴바·헤더처럼 자리가 좁을 때.
 · `column` — 설명을 인라인으로 펼친 컬럼 한 칸. **컬럼 자체가 설명 공간**이 되므로
   "위치가 곧 설명"이라는 원칙이 오히려 더 곧이곧대로 지켜진다.

#### 알아둘 것 — 유령 2개 제한과 리뷰 유령

동시 2개 제한은 화면 전체 기준이라, 레벨 유령과 구성원 유령이 떠 있으면
**리뷰 유령은 자리를 못 잡는다**(우선순위 4). 영역별로 따로 세고 싶다면
`useFeatureGhosts`의 `.slice(0, 2)`를 영역 단위로 나누면 된다 — 지금은 설계대로 전체 2개로 뒀다.

#### 3g에서 뺀 것 — 주기를 여러 단계로 쪼개기

시안의 2→3 화면에는 구분선(`┊`)으로 `Sprint 1 | Sprint 2 · Sprint 3`처럼 나누는 기능이 있었다. 뺐다.

`Sprint.milestone`은 NOT NULL이고 **스프린트를 다른 마일스톤으로 옮기는 API가 없다.**
게다가 `sprint_columns`도 마일스톤 단위라 스프린트를 옮기면 컬럼 구성이 통째로 달라진다 —
카드가 어느 컬럼에도 못 서는 상태가 생길 수 있다.

그래서 3g는 **기본 마일스톤에 이름·기간을 붙이는 것**까지만 한다.
쪼개기는 "다음 단계를 만들 때부터" 가능하다고 화면에서 밝힌다. 별도 과제로 남긴다.

#### 새로 연 API

`PATCH /boards/{boardId}/sprints/{sprintId}` — 주기 이름·기간 변경.
`Sprint.rename()`·`updatePeriod()`는 엔티티에 있었는데 컨트롤러가 없어 밖에서 부를 수 없었다.
1→2 마법사가 "이번 주기는 언제까지"를 받으려면 필요하다.

#### 검증

- 기존 보드: 마이그레이션 후 화면이 **한 픽셀도 안 바뀐다** (level 3 + 전 옵션)
- 신규 보드: level 1로 생성 → 마일스톤 탭·주기 헤더·레일 없음 → 흐름 컬럼은 그대로 있음
- 서랍에서 레벨 1→2→3 이동 시 데이터 손실 없음, 되돌려도 복원됨

#### 리스크

| # | 내용 | 대응 |
|---|---|---|
| R8 | `SprintBoard.tsx`(5,186줄)를 PR1·PR2에 이어 세 번째로 건드림 | 순차 머지. 3c를 한 커밋으로 좁히고 3e는 별도 커밋 |
| R9 | 레벨 1에서 스프린트 API가 여전히 호출됨 | 데이터는 그대로 두고 **표시만** 끈다. 호출은 유지 — 승급 시 복원 비용 0 |
| R10 | 옵션 문자열 오타로 기능이 조용히 꺼짐 | `UiOption` enum + 파싱 시 미지 키 무시, 서버에서 화이트리스트 검증 |
---

### PR4 — 태스크 날짜 파생 전환 (마이그레이션 + BE + FE · 2일)

**스키마** — `V20260808_120900__add_tasks_date_override.sql`

```sql
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN date_override BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 기존에 날짜가 들어 있던 태스크는 "직접 지정"으로 보존한다.
-- 담긴 스프린트 기간과 정확히 일치하는 건만 파생으로 되돌린다.
UPDATE tasks t
   SET date_override = TRUE
 WHERE (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
   AND NOT EXISTS (
       SELECT 1 FROM sprints s
        WHERE s.id = t.sprint_id
          AND s.start_date IS NOT DISTINCT FROM t.start_date
          AND s.end_date   IS NOT DISTINCT FROM t.due_date
   );
```

**보수적으로 잡는다** — 애매하면 override로 남긴다. 사용자가 넣은 날짜를 지우는 쪽이 훨씬 나쁜 사고다.

**서비스 변경** — `sprint/service/SprintService.java`

```java
addTask()      : !task.isDateOverride() → task.syncDatesFrom(sprint)
closeSprint()  : 이월 태스크 → 다음 스프린트 기간으로 재동기화 + carryOverCount++
removeTask()   : 마일스톤 기간으로 되돌림(또는 null)
```

`MilestoneService.updateInfo()`에서 기간이 바뀌면 미담김 태스크 재동기화.

**프론트**
- `TaskDetailModal.tsx`, `AddFeatureModal.tsx` 등 태스크 생성/수정 폼에서 날짜 입력칸을 **기본 숨김**, "기간 직접 지정" 토글을 켜야 노출
- 토글 ON → `date_override=true`, OFF → `false` + 즉시 재동기화

**검증 (중요):** 배포 전 dev에서 `date_override=false` 태스크의 `start_date/due_date`가 소속 스프린트와 100% 일치하는지 확인. 간트(`WeeklyScheduleView`)가 이전과 동일하게 그려지는지 스냅샷 비교.

---

### PR5 — 피처 날짜 제거 · baseline 대체 (FE 선행 → 2주 뒤 드롭 · 2일 + 관측)

**5a. `tasks.baseline_*` → `origin_sprint_id`**

`V20260808_121000__add_tasks_origin_sprint.sql`

```sql
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN origin_sprint_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_tasks_origin_sprint ON tasks(origin_sprint_id);

UPDATE tasks SET origin_sprint_id = sprint_id
 WHERE origin_sprint_id IS NULL AND sprint_id IS NOT NULL;
```

`addTask()`에서 `origin_sprint_id`가 null이면 최초 담긴 스프린트로 세팅(이후 불변).

`WeeklyScheduleView.tsx` 684·871-943행의 baseline 계획선 → **최초 담긴 스프린트 기간**으로 교체. 이월 횟수(`carry_over_count`)를 계획선 이탈 폭으로 함께 표시.

**5b. 피처 날짜 UI 제거**

| 파일 | 처리 |
|---|---|
| `FeatureCard.tsx:136` | `due_date` 뱃지 → 하위 태스크 최대 마감 파생 표시 |
| `FeatureChipSelector.tsx:137` | 기간 표시 제거 |
| `CalendarView.tsx:222,255,491,569,692` | 피처 마감 마커 제거 |
| `ManagementView.tsx:1711` | 마감 컬럼 → 파생값 |
| `AddFeatureModal.tsx` | 날짜 입력칸 제거 |

**5c. 컬럼 드롭 — 5a/5b 배포 후 최소 2주 관측 뒤 별도 PR**

```sql
ALTER TABLE features DROP COLUMN IF EXISTS start_date;
ALTER TABLE features DROP COLUMN IF EXISTS due_date;
ALTER TABLE tasks    DROP COLUMN IF EXISTS baseline_start_date;
ALTER TABLE tasks    DROP COLUMN IF EXISTS baseline_due_date;
```

---

### PR6 — 블록 폐기 3단계 (BE + FE · 1주+)

`§1.3` 때문에 **JIRA 재정리가 선행 조건**이다. 순서를 지킨다.

**6a. UI 제거 (FE only · 1일)**
- `BoardSubTabs.tsx`에서 "블록 보드" 서브탭 제거 (모든 ui_level에서)
- 칸반 렌즈에서 블록 이동 DnD 비활성화
- JIRA 탭은 그대로 — 아직 블록 위에서 돈다

**6b. JIRA 미러를 블록에서 분리 (BE · 3-4일)**

가장 어려운 조각. 두 안:

| 안 | 내용 | 비용 |
|---|---|---|
| A. 새 테이블 | `jira_status_columns(id, board_id, jira_status_id, name, position, qa_state)` 신설, `BlockStatusMap`을 이 테이블 기준으로 재작성 | 높음 / 깨끗함 |
| B. 블록 축소 | `blocks`를 JIRA 전용으로 남기고 `jira_status_id IS NOT NULL` 행만 유지, 일반 블록 행은 정리 | 낮음 / 이름이 거짓말 |

**권장: B로 먼저 가고, JIRA 연동을 다음에 손볼 때 A로 옮긴다.** 지금 A를 하면 `BlockStatusMap`·`JiraIntegrationConfig`·반려 복귀(`return_block_id`) 전부를 동시에 건드려야 하는데, 이 UX 개편과 묶을 이유가 없다.

**6c. `block_id` 해제 (마이그레이션 · 1일)**

```sql
ALTER TABLE tasks ALTER COLUMN block_id DROP NOT NULL;
```

`TaskService:207`의 자동 할당 제거 → JIRA 연동 태스크만 블록을 가진다.
`TaskRequest.Move.targetBlockId`의 `@NotNull` 해제 + 블록 이동 경로를 JIRA 전용으로 좁힘.
`FixedBlockType.FEATURE/TASK/DONE` 고정 블록 생성 로직 정리(`BoardService` 보드 생성 경로).

**6d. 일반 블록 행 정리 (별도 · 관측 후)**

```sql
DELETE FROM blocks WHERE jira_status_id IS NULL;
```

되돌릴 수 없으므로 최소 한 달 관측 후.

---

## 3. 순서와 일정 (1인 기준)

```
주차 1   PR1 카드 표기      ██          → 즉시 체감, 리스크 없음
         PR2 브레드크럼+배지  ███        → PR4의 사전 관측
주차 2   PR3 게이팅+온보딩   ████████    → 신규 유저 경험의 본체
주차 3   PR4 날짜 파생      █████       → 데이터 변경 시작
         PR5a origin_sprint  ███
주차 4   PR5b 피처 날짜 UI   ███
         PR6a 블록 UI 제거   ██
─────── 여기까지가 UX 개편 본체 (약 4주) ───────
이후     PR6b JIRA 분리      ████████    → 별도 과제로 분리 권장
         PR5c/6c/6d 컬럼 드롭             → 관측 후
```

**PR1~3만 나가도 시안이 주장하는 것의 절반 이상이 실현된다.** 그 셋은 스키마를 건드리지 않으니 여기서 멈춰도 손해가 없다.

---

## 4. 리스크 등록부

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | 날짜 백필이 사용자 입력값을 덮어씀 | 높음 · 복구 어려움 | 보수적 판정(§PR4). 애매하면 override. 백필 전 `tasks` 스냅샷 테이블 생성 |
| R2 | 간트가 깨짐 | 높음 | 파생을 **저장**으로 처리해 소비처 무변경(§1.1). PR4 전 스냅샷 비교 |
| R3 | 기존 보드에서 탭이 사라짐 | 높음 | `ui_level` 기본값 3 백필(§1.2) |
| R4 | 블록 제거로 JIRA 연동 붕괴 | 높음 | 6b 선행. 6c 이전엔 `block_id`를 건드리지 않음 |
| R5 | 피처 날짜 제거로 캘린더 마커 소실 | 중간 | 5b에서 하위 파생으로 대체. 사용 빈도 먼저 측정 |
| R6 | 구성원 뷰 숫자 변경에 대한 혼란 | 중간 | PR1 배포 시 보드 상단 1회성 안내. 전체 수는 상세 모달에 유지 |
| R7 | `SprintBoard.tsx` 5,186줄 — 변경 충돌 | 중간 | PR1/PR2/PR3가 같은 파일을 건드림. **순차 머지**, 병렬 금지 |

---

## 5. 하지 않을 것

- Task에 담당자 추가 — 설계 유지 결정
- 스프린트 컬럼(START/MIDDLE/END) 및 커스텀 컬럼 기능 변경
- 상단 탭 5개(보드·일정·회의·자료실·보고서) 구조 변경 — 렌즈 통합은 서브탭 층만
- 마인드맵·대시보드 뷰 제거 — 렌즈 드롭다운으로 이동만
- JIRA 연동 재설계 — 6b는 최소 변경(안 B)으로 막고 별도 과제로

---

## 6. 착수 전 확인이 필요한 것

1. **피처 날짜 실사용 빈도** — `SELECT count(*) FROM features WHERE start_date IS NOT NULL OR due_date IS NOT NULL;` 결과가 높으면 PR5b를 재검토
2. **태스크 날짜 override 예상 비율** — `SELECT count(*) FILTER (WHERE start_date IS NOT NULL OR due_date IS NOT NULL), count(*) FROM tasks;`
3. **일반 블록에 실제 카드가 서 있는 보드 수** — 블록 보드를 쓰는 팀이 남아 있는지
4. **ui_level 신규 기본값** — 팀 보드는 1, 조직에서 만든 보드는 2로 시작할지 여부
