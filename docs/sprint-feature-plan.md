# 스프린트 기능 기획/제작 계획

> 마일스톤 안의 선택형 스프린트 시스템. 대화 기반 최종 정리본.
> 작성일: 2026-07-13 · 상태: 기획 확정, 개발 착수 전

---

## 1. 배경 & 해결하려는 문제

기존 보드는 `Task / Sprint / In Review / Done` 4개 컬럼으로 운영된다. 문제는 **Sprint 컬럼의 진행 게이지가 카드를 Done으로 옮기면 오히려 줄어든다**는 점이다.

- 원인: **"Sprint"가 워크플로우 단계(Status)와 범위 소속(Scope)을 동시에 겸함.**
- 게이지는 "스프린트 범위의 완료율"을 보고 싶은데, 계산은 "Sprint 컬럼에 남은 카드"로 한다.
- → 완료(Done 이동)할수록 분모에서 빠져 게이지가 **거꾸로** 움직인다.

**해결 방향:** Sprint + In Review + Done을 **하나의 스프린트 컨테이너**로 묶는다. Done이 스프린트 "안"에 있으므로 완료해도 스코프에서 빠지지 않고 게이지가 채워진다.

---

## 2. 확정된 핵심 모델

### 2.1 구조 — Task 공통 + 스프린트 프레임

```
┌─ Task (공통 백로그) ─┐   │   ┌──── 스프린트 프레임 (= 현재 스프린트) ─────────┐
│  피처 카드 + 체크리스트 │   │   │  🏃 스프린트  [S1✓ S2✓ S3●]   스코프 게이지  종료 │
│  ♺ 스프린트와 무관하게  │   │   │  ┌ Sprint ┐  ┌ In Review ┐  ┌ Done ┐          │
│    계속 유지            │   │   │  │ 항목카드 │  │  항목카드   │  │항목카드│          │
│  [항목 담기 →]         │   │   │  └────────┘  └───────────┘  └──────┘          │
└──────────────────────┘   │   └───────────────────────────────────────────────┘
```

- **Task = 공통 백로그.** 피처(에픽) 카드 + 각 피처의 체크리스트. 스프린트와 무관하게 계속 유지된다.
- **Sprint + In Review + Done = 하나의 스프린트.** 이 3개 컬럼이 묶여 "현재 스프린트"를 이룬다.

### 2.2 담기 = 체크리스트 항목이 카드가 된다 (폭발 모델)

- Task 피처의 **체크리스트 항목 하나하나가** "담기 →"를 통해 **개별 카드**로 스프린트에 들어간다.
- 항목-카드는 부모 피처를 브레드크럼으로 표시: `볼 챕터 작업 › 몬스터 스킬`.
- 항목-카드는 `Sprint ↔ In Review ↔ Done` 을 이동하고, `⏏`로 Task 체크리스트로 되돌릴 수 있다.
- **항목-카드가 Done 도달 = 부모 피처의 체크리스트 항목 자동 완료** (양방향 동기화).
- ⚠️ 폐기된 대안: 피처 카드를 통째로 옮기는 방식, 되돌리기 4패턴(드래그백/컨텍스트메뉴 등 복잡한 역방향 UX).

### 2.3 게이지 = 체크리스트 스코프 (Done 포함, Task 제외)

```
스프린트 진행률 = (담긴 항목 중 stage=done) / (담긴 항목 = Sprint+Review+Done)
```

- Task(공통 백로그)의 항목은 게이지에 포함되지 않는다.
- Done이 스프린트 프레임 안에 있으므로 완료해도 분모에서 빠지지 않는다 → **역설 해소.**

### 2.4 스프린트 라이프사이클

`종료 → 아카이브(완료율 동결) → 다음 스프린트 세팅`

- **종료 모달:** 완료/미완료 요약(velocity) + 미완료 처리 선택 + 다음 스프린트 이름·기간.
- **미완료 처리 3분기:**
  - `이월`(기본) — 미완료 카드를 다음 스프린트로 그대로.
  - `Task로 되돌리기` — 항목을 공통 백로그로 복귀.
  - `그대로 종료` — 미완료를 남기고 아카이브.
- **완료율 동결:** 종료 시점의 `completed_count / total_count`를 스프린트에 박아 히스토리 고정 (이월되면 항목 소속이 바뀌므로 다시 세면 틀려짐 → 반드시 동결).
- **Task는 종료와 무관하게 유지**되고, 스프린트 프레임(3컬럼)만 롤오버된다.

### 2.5 예전 스프린트로 돌아가기 (3가지)

| 방식 | 조건 | 동작 |
|------|------|------|
| **열람** | 항상 | 타임라인 칩 클릭 → 동결 스냅샷 읽기 (기록 불변) |
| **종료 취소** | 최신 스프린트 + 다음 스프린트 미착수 시 | 통째로 다시 활성화 (종료 Undo) |
| **항목 재개** | 언제든 | 아카이브 항목을 "→ 현재로" 현재 스프린트에 다시 담기 |

원칙: **기록(velocity)은 보존, 탈출구는 연다.** 통째 되살리기는 최신만(뒤 스프린트 기록 보호), 오래된 건 항목 단위로만 재개.

### 2.6 권한 (B안)

| 동작 | 관리자 | 멤버 | 뷰어 |
|------|:---:|:---:|:---:|
| 스프린트 종료 / 종료 취소 | ✓ | – | – |
| 다음 스프린트 생성·기간 설정 | ✓ | – | – |
| 항목 담기 / 빼기 (계획) | ✓ | ✓ | – |
| **체크리스트 완료 체크** | ✓ | ✓ | – |
| 지난 스프린트 열람 | ✓ | ✓ | ✓ |
| 항목 재개 (→ 현재로) | ✓ | ✓ | – |

- **B안 핵심:** 완료 체크는 **담당자가 아니어도 모든 멤버가 가능**. 대신 `completed_by`(완료자)를 기록하고, 담당자는 아바타로 강조. 완료자 ≠ 담당자면 "대신 완료" 표시.

### 2.7 선택형 노출 (A안)

- **기본 = 1 마일스톤 1 스프린트.** 스프린트 개념이 아예 안 보이고, 마일스톤 진행률 하나로 관리.
- **마일스톤 설정 안쪽 토글**("스프린트로 나누기")을 켠 팀만 스프린트 레이어(타임라인·종료·프레임) 노출.
- 규칙: 마일스톤은 내부적으로 항상 스프린트 1개를 가진다(기본은 숨김). 나눌 때만 드러난다.
- 끄면 담긴 카드가 체크리스트로 병합 → 기록 손실을 명시 확인 후 진행.

---

## 3. 데이터 모델

신규 `sprint` 테이블 1개 + 기존 `checklist_item` / `milestone` 컬럼 추가. **별도 카드 테이블 없음** — 스프린트의 "카드"는 곧 `checklist_item`이다.

### 3.1 신규: `sprint`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | varchar(36) | PK |
| `milestone_id` | varchar(36) | FK → milestone |
| `name` | varchar | "Sprint 1" 등 (자동 넘버링) |
| `sequence_no` | int | 정렬·넘버링 |
| `status` | varchar | `ACTIVE` / `ARCHIVED` |
| `start_date` / `end_date` | date | 기간(선택) |
| `completed_count` | int | 종료 시 **동결**된 완료 카드 수 |
| `total_count` | int | 종료 시 **동결**된 전체 카드 수 |
| `archived_at` | timestamp | UTC, 종료 시각 |
| `created_at` | timestamp | UTC |

### 3.2 추가: `checklist_item` (= 스프린트의 카드 단위)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `sprint_id` | varchar(36) nullable | 담긴 스프린트 (없으면 Task 백로그) |
| `sprint_stage` | varchar nullable | `sprint` / `review` / `done` (프레임 내 위치) |
| `completed_by` | varchar(36) nullable | 완료 체크한 유저 (B안) |
| `completed_at` | timestamp nullable | 완료 시각 UTC |

- `sprint_id = NULL` → Task 공통 백로그.
- `sprint_id = ? AND sprint_stage = 'done'` → 완료(부모 체크리스트 체크 상태와 동기화).

### 3.3 추가: `milestone`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `sprint_enabled` | boolean default false | A안 토글 |

> ⚠️ 실제 테이블/컬럼명(`checklist_item`, `milestone`)은 코드 확인 후 확정. local(H2)은 ddl-auto라 무영향, dev/prod만 Flyway 적용.

---

## 4. 백엔드 (domain/sprint)

### 4.1 API

| 엔드포인트 | 동작 | 권한 |
|------------|------|------|
| `PATCH /milestones/{id}/sprint-mode` | 스프린트 토글 on/off (off 시 병합) | 관리자 |
| `POST /milestones/{id}/sprints` | 스프린트 추가(수동) | 관리자 |
| `GET /milestones/{id}/sprints` | 타임라인(활성+아카이브) 조회 | 읽기 전원 |
| `POST /sprints/{id}/items` | 체크리스트 항목 담기 (sprint_id+stage=sprint) | 멤버+ |
| `DELETE /sprints/{id}/items/{itemId}` | 항목 빼기 (sprint_id=null → Task) | 멤버+ |
| `PATCH /checklist-items/{id}/stage` | 카드 이동 (sprint↔review↔done) | 멤버+ |
| `PATCH /checklist-items/{id}/check` | 완료 체크 → completed_by=현재유저 | 멤버+ |
| `POST /sprints/{id}/close` | 종료(동결 + 미완료 처리 + 다음 생성) | 관리자 |
| `POST /sprints/{id}/reopen` | 종료 취소(최신·미착수 검증) | 관리자 |
| `POST /sprints/{id}/items/{itemId}/resume` | 아카이브 항목을 현재 스프린트로 재개 | 멤버+ |

### 4.2 서비스

- `SprintService` — CRUD, 담기/빼기, 카드 이동(stage), 체크(+completed_by).
- `SprintLifecycleService` — close / reopen / resume (동결·이월·넘버링).
- 게이지 집계 — `ChecklistItemRepository.countBySprint(sprintId)` + `countDoneBySprint(sprintId)`.

### 4.3 규약

- 응답은 Jackson **SNAKE_CASE** (`sprint_id`, `sprint_stage`, `completed_by`, `completed_count`).
- 타임존 **UTC** (`LocalDateTime.now(ZoneOffset.UTC)`).
- 권한 게이팅 — 서버 측 BoardMember role 체크 (FE `useBoardPermissions`와 대응).

---

## 5. 프론트엔드

스프린트 레이어는 `milestone.sprint_enabled === true`일 때만 렌더. 꺼져 있으면 기존 마일스톤 뷰(단일 게이지) 유지.

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| `MilestoneSettings` (수정) | "스프린트로 나누기" 토글 (A안 위치) | off 시 병합 확인 모달 |
| `SprintTimeline` (신규) | 스프린트 칩(완료율·상태) + ＋추가 | 마일스톤 탭에 스프린트 수 뱃지 |
| `SprintFrame` (신규) | Sprint+Review+Done 3컬럼 프레임 + 헤더(게이지·종료) | Task와 분리 |
| `SprintItemCard` (신규) | 항목-카드: 브레드크럼·담당자·완료자·이동(◀▶⏏) | B안 완료자 뱃지 |
| `TaskFeatureCard` (수정) | 피처 + 체크리스트, 항목별 "담기 →" | 항목 stage 뱃지 표시 |
| `EndSprintModal` (신규) | 종료 요약 + 미완료 처리 + 다음 세팅 | MotionModal 기반 |
| `SprintArchiveView` (신규) | 동결 스냅샷 열람 + 종료취소/항목재개 | 조건부 액션 |

- **게이지 로직(FE):** `done_cards / total_cards` (sprint_id 소속, stage in sprint/review/done). Task 제외.
- **디자인 토큰:** CLAUDE.md 준수 (bridge-accent/obsidian, MotionModal, IconButton, custom-scrollbar, slate 계열).

---

## 6. 마이그레이션 (Flyway · 멱등)

`V{YYYYMMDD_HHmmss}__add_sprint_feature.sql` — 타임스탬프 네이밍 + 멱등 패턴.

```sql
-- 1) sprint 테이블
CREATE TABLE IF NOT EXISTS sprint (
  id             VARCHAR(36) PRIMARY KEY,
  milestone_id   VARCHAR(36) NOT NULL,
  name           VARCHAR(120) NOT NULL,
  sequence_no    INT NOT NULL DEFAULT 1,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  start_date     DATE,
  end_date       DATE,
  completed_count INT DEFAULT 0,
  total_count    INT DEFAULT 0,
  archived_at    TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sprint_milestone ON sprint(milestone_id);

-- 2) checklist_item 컬럼 (멱등)
DO $$ BEGIN
  ALTER TABLE checklist_item ADD COLUMN sprint_id VARCHAR(36);
  ALTER TABLE checklist_item ADD COLUMN sprint_stage VARCHAR(20);
  ALTER TABLE checklist_item ADD COLUMN completed_by VARCHAR(36);
  ALTER TABLE checklist_item ADD COLUMN completed_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ci_sprint ON checklist_item(sprint_id);

-- 3) milestone 토글 (멱등)
DO $$ BEGIN
  ALTER TABLE milestone ADD COLUMN sprint_enabled BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
```

---

## 7. 단계별 빌드 플랜

의존성·가치 순. **Phase 1만으로 게이지 역설이 해소**되고 심플↔스프린트 전환이 동작.

### Phase 1 — 기반 (모델 · 토글 · 스코프 게이지)
- [ ] 마이그레이션 (sprint 테이블 + checklist_item 컬럼 + sprint_enabled) `DB`
- [ ] Sprint 엔티티/Repository + 스코프 집계 쿼리 `BE`
- [ ] 마일스톤 토글 API + off 병합 로직 `BE`
- [ ] MilestoneSettings 토글 + 병합 확인 모달 `FE`
- [ ] SprintFrame 기본형 (3컬럼 + 스코프 게이지) + 항목 담기/이동 `FE`

### Phase 2 — 라이프사이클 (종료 · 이월 · 아카이브)
- [ ] `SprintLifecycleService.close()` — 동결 + 미완료 3분기 + 다음 생성/넘버링 `BE`
- [ ] SprintTimeline (칩·완료율·상태) + 마일스톤 탭 뱃지 `FE`
- [ ] EndSprintModal (요약·이월/백로그/보관·다음 세팅) `FE`
- [ ] SprintArchiveView 열람 (동결 스냅샷) `FE`

### Phase 3 — 되돌리기 (종료취소 · 항목 재개)
- [ ] reopen(최신·미착수 검증) + resume(항목 재개) API `BE`
- [ ] ArchiveView 조건부 액션 (종료취소 버튼 / "→ 현재로") `FE`

### Phase 4 — 권한(B안) · 담당자/완료자
- [ ] 서버 역할 게이팅 (종료·세팅·종료취소 = 관리자) `BE`
- [ ] 체크 시 completed_by 기록 + 응답 포함 `BE`
- [ ] 담당자 아바타 강조 + "대신 완료" 뱃지 + 잠금 힌트 `FE`
- [ ] useBoardPermissions 연동 (버튼 disable) `FE`

---

## 8. 착수 전 확정 필요 (열린 결정)

- **스프린트 넘버링** — 마일스톤 내 순번, 삭제 시 번호 재사용 여부.
- **기간 자동 계산** — 다음 스프린트 기본 기간(직전과 동일 길이? 수동?).
- **이월 넛지** — 같은 항목 N회 반복 이월 시 "재검토" 안내.
- **담당자 없는 항목** — 체크 허용/표시 방식.
- **실시간 동기화** — 스프린트 종료/체크를 WebSocket 브로드캐스트(useBoardWebSocket)에 태울지.
- **테이블/컬럼명** — 실제 코드(`domain/checklist`, `domain/milestone`) 확인 후 확정.

---

## 9. 참고 프로토타입 (Claude Artifacts)

| 프로토타입 | 내용 |
|------------|------|
| [완성본 (폭발 모델)](https://claude.ai/code/artifact/787aeefc-6650-40f8-8da6-fbb117db8101) | 실제 보드 + 스프린트 레이어 통합, 항목→카드 담기 |
| [선택형 스프린트 (A안)](https://claude.ai/code/artifact/f9433f75-fdfb-4170-942d-00266eb0db4d) | 1마일스톤 1스프린트 기본 + 토글 전환 |
| [라이프사이클 + 되돌리기](https://claude.ai/code/artifact/e3975255-a25b-414a-8f8a-965618be53a1) | 종료·아카이브·종료취소·항목재개 |
| [권한 B안 통합](https://claude.ai/code/artifact/4e6bb816-07f1-4675-a5c7-ae67d2ac0e95) | 역할 전환으로 권한 테스트 |
| [제작 명세서](https://claude.ai/code/artifact/8fcbbbc6-eda4-405c-9de6-4285f43a3db2) | 데이터 모델·API·컴포넌트·빌드 플랜 |
