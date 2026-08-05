# 자동수정 — 직접 만든 업무를 맥에 맡기기 (수동 위임) 설계

> 작성일: 2026-08-05 · 상태: **설계 · 미착수**
> 선행 문서: `tools/autofix/README.md` (러너 셋업·프로토콜), `docs/jira-qa-sync-plan.md` (JIRA 연동)

## 1. 무엇을 만드는가

지금 자동수정은 **JIRA QA 이슈**만 다룬다. 트리아지가 후보를 고르고 → 큐에 담기고 → 맥이 가져가
고쳐서 PR을 연다. 여기에 **사람이 직접 만든 업무를 같은 맥에 맡기는 경로**를 추가한다.
트리아지를 거치지 않고, 지시문을 사람이 쓴다.

**범위 안**

- **태스크 단위** 위임 — 카드 하나를 통째로 맡긴다
- **체크리스트 항목 단위** 위임 — 카드 안의 항목 하나(또는 여럿)만 맡긴다. **이쪽이 주 경로다** (D9)
- 기존 큐·러너·PR 경로 전부 공유 (맥은 1대, 직렬)
- 결과는 PR까지. 실패 시 지시문을 고쳐 다시 맡기기

**범위 밖 (이번에 하지 않는다)**

- 머지 — 자동수정의 근본 가드레일이다. 수동 위임이라고 예외를 두지 않는다
- 러너 여러 대 / 저장소 여러 개 — 지금 러너는 프로젝트 디렉터리 하나에 고정돼 있다
- 대화형 후속 지시 — 한 번 던지면 끝. 되묻는 채널이 없다
- 러너에 Bash 허용 — 3절 D3, 9절 참고

---

## 2. 지금 구조에서 무엇이 재사용되는가

파이프라인은 세 층이고, JIRA에 묶여 있는 건 맨 위 한 층뿐이다.

```
① 후보 선정 (트리아지)      JiraAutofixTriageService     ← JIRA 전용. 수동 위임은 이 층을 건너뛴다
② 큐 + 러너 프로토콜        JiraAutofixQueueService      ← 이미 범용. 거의 손대지 않는다
③ 러너 실행                 tools/autofix/runner/*.sh    ← 프롬프트만 QA 고정, 나머지는 범용
```

②에 이미 들어 있고 그대로 물려받는 것:

| 기능 | 위치 | 수동 위임에도 필요한가 |
|------|------|----------------------|
| 직렬 보장 (in-flight 1건) | `claim()` → `countInFlight` | **필수.** Unity Editor가 프로젝트당 하나뿐이라는 물리적 사실 |
| 일일 상한 | `countDispatchedSince` | 필요 (8절) |
| 90분 미회신 회수 | `JiraAutofixScheduler` + `markTimedOut` | 필수. 한 건이 큐 전체를 막는다 |
| 강제 회수 | `release()` + `DELETE ?force=true` | 필수 |
| 러너 생존·자가진단 | `touchRunner` / `RunnerStatus` | 그대로 |
| 콜백 토큰 인증 | `verifyCallbackToken` | 그대로 |
| 슬랙 결과 알림 | `JiraAutofixSlackPublisher` | 그대로 (출처만 표기) |
| 도크 UI (작업 목록·로그·취소) | `JiraAutofixDock.tsx` | 그대로 + 진입점 추가 |

**이 재사용이 곧 설계의 핵심이다.** 아래 D1이 그 이유다.

---

## 3. 설계 결정

### D1. 큐를 새로 만들지 않고 `jira_autofix_jobs`를 확장한다

큐를 나누면 "맥 1대가 한 번에 한 건"이라는 사실을 두 큐가 각각 모른 채 각자 한 건씩 내준다.
그걸 막으려고 두 큐 위에 조정자를 하나 더 두면, GitHub Actions를 걷어내면서 없앤 바로 그
"서버가 러너 사정을 추측하는 구조"가 되돌아온다. 직렬 보장은 **테이블 하나 안에서** 성립해야 한다.

- **기각한 대안:** `autofix_manual_jobs` 별도 테이블 + 조정 계층
- **대가:** 테이블 이름이 `jira_`인데 JIRA와 무관한 행이 들어간다. 감수한다 — 테이블 rename은
  엔티티·리포지토리·마이그레이션을 전부 건드리는 데 비해 얻는 것이 이름뿐이다. 대신 엔티티
  주석에 "이 테이블은 JIRA 전용이 아니다"를 명시한다

### D2. `jira_issue_key` → `job_key`로 이름을 바꾼다

이 값은 화면·러너 명세·PR 제목·브랜치 이름에 전부 노출되는 1급 식별자다. `MANUAL-…`이 들어 있는
컬럼 이름이 `jira_issue_key`면 앞으로 이 코드를 읽는 사람이 매번 걸린다.

- `job_kind = JIRA`일 때만 JIRA 이슈 키로 해석한다. JIRA 댓글·이슈 링크 경로는 이 조건으로 막는다
- **선행 확인:** dev DB의 `jira_autofix_jobs` 행 수. 파이프라인이 아직 실 운영 전이라 지금이
  rename 비용이 가장 싼 시점이지만, 배포 순간에는 구버전 앱이 붙어 있으면 안 된다
  (마이그레이션 → 앱 배포 순서 고정)
- **기각한 대안:** 컬럼을 그대로 두고 `MANUAL-…`을 `jira_issue_key`에 넣기. 무위험이지만
  이름이 거짓말을 하는 상태가 영구히 남는다

### D3. 지시문은 서버가 조립하고, 안전장치는 러너가 붙인다

러너가 실행하는 프롬프트는 **고정 헤더(제약) + 서버가 내려준 지시문** 구조로 만든다.

```
[러너 하드코딩 — 서버가 바꿀 수 없다]
- 지시와 직접 관련된 최소 변경만. 리팩터링·정리·포맷팅 금지
- 에셋 바이너리(.unity, .prefab, .asset) 수정 금지
- .github/ 아래 파일 수정 금지
- 기대 동작이 확정되지 않으면 아무것도 고치지 말고 이유를 말하고 끝낸다
[서버가 내려준 지시문]
…
```

`--allowedTools "Read,Grep,Glob,Edit,mcp__unity"` 도 러너 하드코딩으로 남긴다. **Bash는 넣지 않는다.**

- **이유:** 프롬프트 본문을 서버가 쥐면 표현을 고칠 때마다 맥에 재배포하지 않아도 된다. 반대로
  안전장치를 서버가 쥐면 "임의 문자열 하나로 가드레일을 지울 수 있는" 상태가 된다. 둘을 쪼갠다
- `.github/` 금지는 **이번에 새로 넣는 항목**이다. 프롬프트뿐 아니라 러너가 PR 직전에
  `git diff --name-only`로 실제 확인해 걸리면 실패 처리한다 — 워크플로 파일 변경은 PR을 여는
  것만으로 실행되는 경로가 있어, "사람이 리뷰 후 머지"라는 전제가 성립하지 않는다

### D4. 브랜치 이름에 job id를 넣는다

지금은 `autofix/<이슈키>`다. 수동 위임은 **실패 → 지시문 수정 → 재시도**가 정상 흐름이라 같은 키로
두 번 이상 돈다. 그때 remote에 남은 이전 브랜치와 non-fast-forward로 부딪혀 `git push`가 실패한다.

```
autofix/<job_key>-<job id 앞 6자>      예: autofix/TASK-a1b2c3d4-9f2e17
```

- 이건 **JIRA 경로에도 이미 잠재된 문제**다. `existsActiveForIssue`가 `CANCELLED`를 제외하므로,
  강제 회수(`release()`)된 건은 재투입이 가능한데 그 회수 시점에 러너가 이미 push를 마쳤을 수 있다.
  수동 위임에서는 이게 예외가 아니라 기본 흐름이 되므로 지금 함께 고친다
- 브랜치 이름은 계속 **서버가 정한다** (`buildRunnerJob`). 러너가 정하면 재실행마다 규칙이 흔들린다

### D5. 큐 우선순위를 명시적으로 정한다 — 수동 우선

사람이 지금 기다리고 있는 일이 QA 배치 뒤에 줄 서면 안 된다.

현재 정렬은 `ORDER BY j.confidence DESC, j.queuedAt ASC`인데, 수동 작업은 `confidence`가 NULL이다.
**Postgres는 `DESC`에서 NULL을 먼저 놓고, H2는 뒤에 놓는다.** 즉 지금 그대로 두면 local(H2)과
dev(Postgres)에서 큐 순서가 정반대가 된다. 우연에 기대지 않고 못 박는다:

```sql
ORDER BY (job_kind = 'MANUAL') DESC, confidence DESC NULLS LAST, queued_at ASC
```

JPQL로는 `CASE WHEN j.jobKind = 'MANUAL' THEN 0 ELSE 1 END ASC, …` 형태로 쓴다.

### D6. 가드레일은 출처별로 다르게 적용한다

| 가드레일 | JIRA | MANUAL | 이유 |
|----------|------|--------|------|
| confidence 임계값 | 적용 | **해당 없음** | 트리아지 점수가 없다. 사람이 명시적으로 골랐다 |
| 이슈당 1회 | 적용 | **해제** | 재시도가 정상 흐름이다. 대신 같은 **대상**(태스크 또는 체크리스트 항목)의 `QUEUED`/`DISPATCHED` 중복만 막는다 |
| 이미 완료된 태스크 스킵 | 적용 (`AutofixTaskStage`) | **해제** | 사람이 완료된 카드를 골랐다면 의도가 있다. 화면에서 경고만 띄운다 |
| 일일 상한 | 적용 | **적용 (공유)** | 상한의 목적은 리뷰 부담과 맥 점유이지 출처가 아니다. D5의 우선순위로 대기 문제는 풀린다 |
| PR까지만 (머지 없음) | 적용 | **적용** | 예외 없음 |
| `.github/` 변경 금지 | 신규 적용 | 신규 적용 | D3 |

### D7. 컴파일 게이트는 우회 옵션을 두지 않는다

"문서만 고치는 업무니까 게이트를 끄고 싶다"는 요구가 반드시 나온다. 두지 않는다 — 코드 변경이
0줄이면 게이트는 어차피 통과하고, 켜고 끌 수 있게 만드는 순간 실패한 게이트를 끄는 데 쓰인다.
저장소에 테스트가 0개인 동안 이게 유일한 자동 게이트다.

### D8. 결과 통지는 출처별로 갈린다

| | JIRA | MANUAL |
|---|------|--------|
| JIRA 이슈 댓글 | 단다 | **달지 않는다** (이슈가 없다) |
| 슬랙 | 그대로 | 그대로, 출처 표기 추가 |
| BRIDGE 태스크 | — | **결과 댓글**로 PR 링크·실패 사유를 남긴다 |

체크리스트 항목에는 댓글 기능이 없다. 항목 단위로 맡겨도 결과는 **부모 태스크의 댓글**로 가고,
어느 항목이었는지를 댓글 본문이 밝힌다 (`체크리스트: 빈 이름일 때 저장 버튼 비활성화`).

태스크 댓글이 필요한 이유: 수동 위임은 위임한 사람이 결과를 기다리는데, 도크를 계속 열어둘
이유가 없다. 카드에 남아야 나중에 맥락이 이어진다.

### D9. 위임 단위는 태스크가 아니라 **체크리스트 항목**이 기본이다

BRIDGE에서 실제 작업 단위는 태스크가 아니라 체크리스트 항목이다. 근거가 코드에 남아 있다 —
v7.0에서 `Task.assignee`를 없애고 **담당자를 `ChecklistItem.assignee`로 옮겼고**, 자동수정
트리아지도 "지금 누가 이 코드를 만지고 있는가"를 `loadChecklistAssignees()`로 읽는다.
사람이 맡기고 싶은 단위도 같다. "이 카드 고쳐줘"보다 "이 항목 하나 해줘"가 훨씬 많다.

- 태스크 단위 위임도 남긴다. 항목으로 쪼개지 않은 카드가 있고, 카드 전체가 한 덩어리인 경우도 있다
- 두 경로 모두 **같은 모달·같은 큐·같은 job 테이블**을 쓴다. 다른 것은 대상의 범위뿐이다

### D10. 대상은 `target_type` 열거형이 아니라 "태스크 + (선택) 체크리스트 항목"으로 표현한다

job은 `task_id`를 **항상** 갖고, `checklist_item_id`가 있으면 범위가 그 항목으로 좁혀진다.

- **이유:** 체크리스트 항목은 태스크 없이 존재할 수 없고, 무엇보다 **지시문 조립에 부모 태스크가
  항상 필요하다**(D11). `target_type`으로 나누면 "CHECKLIST면 부모를 조회한다"는 분기가
  큐·프롬프트·통지·화면 네 곳에 각각 생긴다
- **기각한 대안:** `target_type VARCHAR + target_id VARCHAR`. 범용적으로 보이지만 조인이
  런타임 분기로 바뀌어 JPA 매핑이 사라진다

### D11. 체크리스트 항목은 제목 한 줄뿐이다 — 맥락은 부모 태스크가 채운다

`ChecklistItem`에는 **설명 필드가 없다.** `title` 200자가 전부다. 그대로 보내면 에이전트가 받는
지시는 "저장 버튼 비활성화" 한 줄이고, 그걸로는 아무것도 못 한다.

서버가 조립하는 프롬프트는 세 부분으로 나뉜다:

```
[맥락] 이 작업이 속한 태스크: {task.title}
       {task.description}
[대상] 위 태스크의 체크리스트 항목 하나만 처리한다: "{item.title}"
       태스크 설명에 있는 다른 항목은 건드리지 않는다.
[지시] {사람이 쓴 지시문}
```

**"다른 항목은 건드리지 않는다"가 핵심 문장이다.** 이게 없으면 에이전트는 태스크 설명 전체를 보고
범위를 넓힌다 — 최소 변경 원칙과 정면으로 부딪히고, 리뷰어는 항목 하나짜리 PR을 기대했다가
카드 전체 변경을 받는다.

### D12. 항목 여럿을 골라도 job은 항목당 하나씩 만든다

체크리스트에서 3개를 고르면 job 3개, PR 3개다. 하나로 묶지 않는 이유:

- **실패 단위가 섞인다.** 3개 중 1개만 실패해도 PR 전체가 실패로 남고, 성공한 2개까지 버려진다
- **리뷰 단위가 커진다.** 항목별 PR이면 리뷰어가 하나씩 보고 하나씩 머지한다
- **시간은 어차피 같다.** 맥은 직렬이라 묶든 나누든 총 소요는 변하지 않는다

화면에서는 "3건을 맡겼습니다"로 묶어 말한다. 도크에서는 같은 태스크 키를 공유하므로 인접해 보인다.

### D13. PR이 열려도 체크리스트를 자동으로 체크하지 않는다

PR은 머지가 아니다. 자동으로 완료 처리하면 두 가지가 깨진다 — 사람이 보는 진척률이 거짓이 되고,
`AutofixTaskStage.isAlreadyDone()`이 그 태스크를 **이후 자동수정 후보에서 영구히 제외**한다.
아직 머지되지도 않은 변경 때문에 그 카드가 파이프라인에서 사라지는 것이다.

항목에는 PR 링크만 단다. 체크는 머지한 사람이 한다.

### D14. 담당자는 막지 않는다 — 대신 항목 행에 진행 상태를 띄운다

체크리스트 담당자는 항상 사람이고, **그 사람이 곧 위임하는 사람이다.** 자기 항목을 맥에 맡기는
것이므로 "다른 사람이 만지고 있다"는 충돌 경고는 성립하지 않는다. 확인 단계도 넣지 않는다.

대신 필요한 것은 반대 방향이다 — **맡긴 사람이 자기 항목에서 진행 상황을 볼 수 있어야 한다.**
지금 설계대로면 그걸 보려고 하단 도크를 열어 큐에서 자기 항목을 찾아야 한다. 맡긴 자리와 확인하는
자리가 다르면 사람들은 확인하지 않는다.

체크리스트 항목 행(`TaskDetailModal`)에 담당자 칩 옆으로 상태 칩을 붙인다:

| 상태 | 칩 | 누르면 |
|------|-----|--------|
| `QUEUED` | `맥 대기` — `bg-foreground/10 text-slate-400` | 취소 |
| `DISPATCHED` | `맥 작업 중 · 12분` — `bg-bridge-accent/15` | 도크 열기 |
| `SUCCEEDED` | `PR #412` — `bg-emerald-500/15` | PR 열기 |
| `NO_CHANGE` | `변경 없음` — `bg-foreground/10` | 에이전트 로그 |
| `FAILED` / `TIMED_OUT` | `실패` — `bg-rose-500/15` | 로그 + 다시 맡기기 |

**위임자는 담당자와 다를 때만 표기한다.** 같으면 아무 말도 하지 않는다 — 자기가 맡긴 것을
"당신이 맡겼습니다"라고 알려주는 화면은 소음이다. 다를 때가 진짜 알아야 할 때다.

이 칩이 생기면서 **도크는 운영자용으로 성격이 분명해진다.** 일을 맡기고 결과를 받는 사람은
카드만 보면 되고, 도크는 큐 전체가 왜 막혔는지 · 러너가 살아 있는지를 보는 자리로 남는다.

---

## 4. 데이터 모델

`backend/src/main/resources/db/migration/V{YYYYMMDD_HHmmss}__autofix_manual_jobs.sql`
(타임스탬프는 작성 시각 `date -u +%Y%m%d_%H%M%S`로 생성)

```sql
-- 자동수정 큐를 JIRA 이슈 전용에서 "맥에 맡기는 작업" 일반으로 넓힌다.
-- 큐를 나누지 않는 이유는 직렬 보장이 테이블 하나 안에서 성립해야 하기 때문이다(설계 D1).

-- 1) 식별자 일반화: jira_issue_key → job_key (멱등)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'jira_autofix_jobs' AND column_name = 'jira_issue_key')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'jira_autofix_jobs' AND column_name = 'job_key') THEN
        ALTER TABLE jira_autofix_jobs RENAME COLUMN jira_issue_key TO job_key;
    END IF;
END $$;

-- 2) 출처. 기존 행은 전부 JIRA다
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN job_kind VARCHAR(10) NOT NULL DEFAULT 'JIRA';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_jira_autofix_job_kind') THEN
        ALTER TABLE jira_autofix_jobs ADD CONSTRAINT ck_jira_autofix_job_kind
            CHECK (job_kind IN ('JIRA', 'MANUAL'));
    END IF;
END $$;

-- 3) 사람이 쓴 지시문. 러너 프롬프트의 본문이 된다
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN instruction TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4) 누가 맡겼는가. 임의 지시문이 맥에서 실행되므로 감사 경로가 있어야 한다(9절)
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN created_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5) 브랜치 이름 고정 — 재시도 시 remote 충돌을 막는다(설계 D4)
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN branch_name VARCHAR(200);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6) 위임 범위. NULL이면 태스크 전체, 값이 있으면 그 체크리스트 항목만(설계 D10).
--    task_id는 이 경우에도 항상 채운다 — 프롬프트 맥락이 부모 태스크에서 나온다(D11).
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN checklist_item_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 7) 큐 조회 경로 (우선순위 정렬 · 대상 중복 확인)
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_kind
    ON jira_autofix_jobs(board_id, job_kind, status);
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_task
    ON jira_autofix_jobs(board_id, task_id);
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_checklist
    ON jira_autofix_jobs(board_id, checklist_item_id);
```

`checklist_item_id`에 FK를 걸지 않는다. 체크리스트 항목은 소프트 삭제(`deleted_at`)되는데,
삭제된 항목으로 돌린 작업의 이력은 남아야 한다. 조회 시 항목이 없으면 제목만 화면에 남는다.

`branch_name`을 컬럼으로 두는 이유: 지금은 `buildRunnerJob`이 매번 문자열을 조립하는데, job id를
섞는 순간 "러너가 실제로 push한 브랜치"와 화면이 어긋날 여지가 생긴다. 큐에 담을 때 확정해 저장한다.

**엔티티 변경** (`JiraAutofixJob.java`)

- `jiraIssueKey` → `jobKey`, `jobKind`(enum `AutofixJobKind`), `instruction`, `createdBy`,
  `branchName`, `checklistItemId` 추가
- 정적 팩터리 셋으로 나눈다: `forJiraIssue(...)` / `forManualTask(...)` / `forManualChecklistItem(...)`
  — 빌더를 그대로 열어두면 MANUAL인데 confidence가 들어가거나, 체크리스트 항목만 있고 태스크가
  비어 있는(D10 위반) 조합이 만들어진다
- `jobKey` 규칙: `QASA-40` (JIRA) / `TASK-a1b2c3d4` (태스크) / `CHK-7f0e21b9` (체크리스트 항목)
  — 접두사만 봐도 위임 범위를 알 수 있어야 도크 목록이 읽힌다

---

## 5. 서버 API

### 신규

```
POST   /api/v1/boards/{boardId}/jira/autofix/manual        수동 업무 위임
```

요청 (snake_case):

```json
{
  "task_id": "…",                       // 필수
  "checklist_item_ids": ["…", "…"],     // 비우면 태스크 전체, 채우면 항목마다 job 1개(D12)
  "instruction": "…"                    // 필수. 사람이 쓴 지시문
}
```

응답: `JiraAutofixResponse.JobItem` **배열** — 항목을 여럿 고르면 job이 여럿 생긴다(D12).

- 권한: `boardService.checkAdminOrAbove` — 기존 enqueue와 동일. 9절 참고
- 검증: `instruction` 1~4000자. `task_id`가 그 보드 소속인지 확인하고,
  `checklist_item_ids`가 **모두 그 태스크의 항목인지** 확인한다 — 다른 태스크의 항목 id를 섞어
  보내면 D11의 맥락 조립이 엉뚱한 태스크 설명을 붙인다
- 지시문은 고른 항목 전체에 **같은 문장이 들어간다.** 항목별로 다른 지시가 필요하면 따로 맡긴다
  (한 모달에서 항목마다 입력칸을 주면, 3개를 고른 순간 화면이 폼 더미가 된다)
- 한 번에 담을 수 있는 항목 수는 `maxEnqueuePerRequest`를 그대로 따른다
- 대상 저장소/브랜치는 기존 `resolveTarget(boardId)`를 그대로 쓴다 (큐 투입 시점 스냅샷)
- 러너 자가진단 `verify_ready = false`면 **거부한다.** 지금 도크가 QA 후보 담기를 막는 것과 같은
  이유 — 담아봐야 PR 직전에 전부 실패한다

### 변경

| 엔드포인트 | 변경 |
|-----------|------|
| `GET .../jobs` | `JobItem`에 `job_kind`, `checklist_item_id`, `parent_task_title`, `instruction`(앞 200자), `created_by`·`created_by_name` 추가 |
| `GET .../jobs?task_id=` | **신규 필터** — 태스크 상세가 자기 항목들의 상태만 가져온다(D14). 전체 목록을 받아 화면에서 거르면 카드 하나 열 때마다 큐 전체가 넘어온다 |
| `GET .../queue-status` | `queued_manual` / `queued_jira` 분리 표시 |
| `DELETE .../jobs/{jobId}` | 변경 없음 (취소·강제 회수 공통) |
| `POST .../runner/{boardId}/claim` | 응답 `RunnerJob` 스키마 변경 (6절) |
| `POST .../callback/{boardId}` | `issue_key` → `job_key`. 구 필드도 한동안 받아준다 |

`JiraAutofixQueueService`에서 실제로 손대는 지점은 넷뿐이다:
`enqueueManual()` 추가 · `claim()`의 정렬(D5) · `buildRunnerJob()`의 프롬프트 조립 ·
`completeJob()`의 통지 분기(D8).

---

## 6. 러너 프로토콜 변경

### claim 응답 (`RunnerJob`)

```json
{
  "job_id": "…",
  "job_key": "CHK-7f0e21b9",
  "job_kind": "MANUAL",
  "title": "빈 이름일 때 저장 버튼 비활성화",
  "instruction": "…서버가 조립한 프롬프트 본문(맥락+대상+지시)…",
  "repo_full_name": "cookapps-devops/GWBM013-auto-battle-project",
  "base_ref": "develop",
  "branch": "autofix/CHK-7f0e21b9-9f2e17",
  "timeout_minutes": 60
}
```

- `jira_issue_key` / `issue_title` / `issue_body` / `verification` / `test_infra`를
  `job_key` / `title` / `instruction` 으로 접는다. **JIRA 경로도 같은 형태로 통일한다** — 러너가
  출처별로 분기하기 시작하면 안전장치도 두 벌이 된다
- **러너는 위임 단위를 모른다.** 체크리스트든 태스크든 JIRA 이슈든 `instruction` 한 덩어리로 온다.
  맥락·범위 제한을 문장으로 만드는 것은 전부 서버의 일이다(D11) — 러너에 "체크리스트일 때는…"
  분기가 생기는 순간, 프롬프트를 고치려면 맥에 재배포해야 한다
- `title`은 PR 제목이 된다. 체크리스트 위임이면 **항목 제목**이 들어간다 — 태스크 제목을 쓰면
  리뷰어가 카드 전체 변경을 기대하고 PR을 연다
- JIRA 작업의 `instruction`은 서버가 기존 문구(이슈 본문 + 트리아지 검증 수단 + 테스트 없음 안내)를
  그대로 조립해 채운다. 러너 입장에서는 차이가 없다

### `autofix-once.sh` 변경

1. `jira_issue_key` 필수 체크 → `job_key` 필수 체크
2. 프롬프트: 하드코딩 제약 헤더 + `instruction` (D3)
3. 브랜치: 서버가 준 `branch`를 그대로 사용 (폴백 `autofix/$JOB_KEY`)
4. **PR 직전 `.github/` 변경 검사 추가** (D3)
   ```bash
   if git diff --name-only --cached | grep -q '^\.github/'; then
     fail "워크플로 파일(.github/)을 변경했습니다. 자동수정은 이 경로를 건드리지 않습니다"
   fi
   ```
5. 콜백 페이로드 `issue_key` → `job_key`
6. PR 본문: 출처가 MANUAL이면 "위임자: {이름}" 과 지시문 원문을 접어서 포함

기존 수동 실행 경로(`NO_REPORT=1` + heredoc)는 그대로 유지한다 — 맥에서 한 건만 돌려보는 유일한 수단이다.

---

## 7. 프론트엔드

### 진입점 — 둘 다 같은 모달을 연다

**A. 체크리스트 항목의 더보기 메뉴 → "맥에 맡기기"** *(주 경로)*
그 항목이 선택된 채로 모달이 열린다. 하나만 맡길 때 가장 빠른 길이다.

**B. 태스크 헤더 더보기 메뉴 → "맥에 맡기기"**
범위를 고르는 상태로 모달이 열린다 — 태스크 전체 / 항목 골라서(다중 선택).

**C. 도크 → "직접 업무 만들기"** *(보류)*
카드로 만들 가치가 없는 잡업무용. 수요를 보고 붙인다.

모달은 **하나**다. 진입점이 초기 선택 상태만 다르게 넘긴다 — 화면을 둘로 나누면 지시문 입력·제약
안내·러너 상태 확인이 두 곳에서 각각 낡는다.

### 위임 모달

대상 영역이 위임 단위를 결정한다:

- 상단: 태스크 카드(제목·저장소·브랜치) — 항상 보인다. 체크리스트를 맡길 때도 **맥락은 이 카드에서
  나간다**는 사실이 화면에 드러나야 한다(D11)
- 그 아래: 체크리스트 목록. 각 항목에 체크박스 + 담당자 아바타 + 완료 여부
  - 완료된 항목은 흐리게, 선택하면 경고 한 줄. 막지는 않는다
  - 담당자가 있는 항목은 아바타를 보여준다 — 트리아지가 체크리스트 담당자를 싣는 이유와 같다.
    "지금 이 코드를 누가 만지고 있는지" 모르고 맡기면 충돌한다. 역시 막지는 않는다
  - 항목이 하나도 없는 태스크면 이 영역이 통째로 빠지고 태스크 위임만 남는다
- 하단: "태스크 전체 맡기기" 선택지 — 항목을 아무것도 고르지 않았을 때만 활성

제출 버튼은 고른 개수를 말한다: `맡기기` / `2건 맡기기`.

### 체크리스트 항목 행 (D14)

담당자 칩 다음, 타임블록 시간 앞에 상태 칩이 들어간다. 항목당 최대 하나 — **가장 최근 job**의
상태를 보여준다(재시도하면 이전 job은 이력이지 현재 상태가 아니다).

```
☐  빈 이름일 때 저장 버튼 비활성화     [유서기]  [맥 작업 중 · 12분]   2h  ⋮
☑  중복 이름 검사 추가                 [유서기]  [PR #412]                 ⋮
☐  프리셋 삭제 확인 팝업               [김OO]                              ⋮
```

- 상태 칩이 없는 항목은 맡긴 적이 없는 항목이다. 빈 자리를 만들지 않는다
- 진행 중인 job이 하나라도 있으면 10초 폴링, 없으면 태스크를 열 때 한 번만 조회
- 위임자가 담당자와 다르면 칩 앞에 위임자 이니셜 아바타를 작게 붙인다

### 도크 변경 (`JiraAutofixDock.tsx`)

- 행에 출처·범위 뱃지 — `수동`(`bg-bridge-secondary/15`) + `CHK`/`TASK` 접두사가 붙은 job_key
- 체크리스트 위임 행은 **부모 태스크 제목을 보조 줄에** 함께 보여준다. 항목 제목만으로는
  "빈 이름일 때 저장 버튼 비활성화"가 어느 카드 일인지 알 수 없다
- 지시문 펼쳐보기 — 진행 중인 행에서만
- 큐 현황에 `대기 N건 (수동 M)` 표기

D14의 칩이 생기면서 도크의 역할이 좁아진다. **일을 맡기고 받는 사람은 카드만 보면 되고**,
도크는 큐 전체가 왜 막혔는지·러너가 살아 있는지를 보는 운영자 화면으로 남는다.

### 토큰 (프로젝트 표준 그대로)

- `MotionModal` 기반. 헤더 `px-5 pt-4 pb-3 border-b border-foreground/[0.08]`, 바디 `px-5 pb-5 pt-4`
- textarea: `bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm
  placeholder-slate-500 focus:ring-2 focus:ring-bridge-accent/50`
- 체크박스 행: `hover:bg-foreground/5`, 선택 시 `bg-bridge-accent/[0.07] border-bridge-accent/40`
- 러너 오프라인 / `verify_ready=false`면 제출 버튼 비활성 + 사유 표시
- 위임 전 확인 문구: *"수정 결과는 PR까지만 만들어집니다. 머지는 사람이 합니다."*

### 파일

| 파일 | 변경 |
|------|------|
| `components/AutofixDelegateModal.tsx` | **신규** — 위임 모달 (범위 선택 + 지시문) |
| `hooks/useAutofixRunnerStatus.ts` | **신규** — 러너 상태. 메뉴·모달이 공유, 도크 폴링과 중복 제거 |
| `hooks/useAutofixTaskJobs.ts` | **신규** — 태스크의 항목별 job 상태 (D14). 진행 중일 때만 폴링 |
| `components/task/TaskHeaderActionsMenu.tsx` | 항목 1줄 |
| `components/TaskDetailModal.tsx` | 항목 메뉴 1줄 · **항목 행 상태 칩(D14)** · 모달 연결 · 결과 댓글 |
| `components/JiraAutofixDock.tsx` | 뱃지 · 부모 태스크 보조 줄 · 지시문 펼치기 |
| `utils/api.ts` | `enqueueManual(boardId, payload)` + `JobItem` 필드 |

응답 인터페이스는 snake_case 유지 (`checklist_item_id`, `job_kind`, `parent_task_title`).

---

## 8. 처리량

맥 1대 · 직렬 · 건당 10~40분 = **하루 실질 12~20건**. 현재 `dailyLimit` 기본값 20은 이 물리 상한과
거의 같으므로 수동 위임을 얹어도 새 상한이 필요 없다. 부족해지면 그건 상한이 아니라 맥이 부족한 것이다.

수동 작업이 우선(D5)이므로 QA 배치가 뒤로 밀린다. 이게 의도한 동작이다 — QA 후보는 밤새 돌아도
되지만 사람이 맡긴 일은 지금 기다리고 있다.

---

## 9. 보안 검토

**성격이 달라진다.** QA 자동수정의 지시문은 트리아지가 만들지만, 수동 위임은 사람이 임의의 문자열을
사내 맥에서 도는 에이전트에 직접 보낸다. 제한된 형태의 원격 실행이다.

현재 방벽과 남는 위험:

| 방벽 | 상태 | 남는 위험 |
|------|------|----------|
| `allowedTools`에 Bash 없음 | 있음 (러너 하드코딩) | Edit로 저장소 내 임의 파일 수정은 가능 |
| 저장소 고정 (러너가 origin 대조) | 있음 | 그 저장소 안에서는 무엇이든 |
| PR까지만, 머지 없음 | 있음 | 사람 리뷰가 최종 방벽 |
| `.github/` 변경 차단 | **이번에 추가** | 없으면 위 "사람 리뷰" 전제가 깨진다 |
| 권한 `checkAdminOrAbove` | 있음 | 보드 관리자 전원이 이 권한을 갖는다 |
| 감사 (`created_by` + `instruction` 보존) | **이번에 추가** | — |

- **`.github/` 차단이 이번 변경에서 가장 중요한 안전장치다.** 프롬프트 문구만이 아니라 러너가
  실제 diff를 검사해야 한다 (D3, 6절)
- 프롬프트 인젝션: 태스크 본문을 지시문에 이어붙이므로 JIRA에서 pull된 텍스트가 프롬프트에
  섞인다. 이 위험은 JIRA 경로에 **이미 존재**하고 수동 위임이 새로 만들지 않는다. 완화책은
  동일하다 — Bash 없음, 저장소 고정, 머지 없음
- `ANTHROPIC_API_KEY`는 맥에만 있고 BRIDGE는 모른다. 이 구조는 유지한다

---

## 10. 실패 모드

| 상황 | 지금 | 이후 |
|------|------|------|
| 러너가 죽은 채 물고 있음 | 90분 후 `TIMED_OUT`, 도크에서 강제 회수 | 동일 |
| 재시도 시 브랜치 충돌 | **push 실패 (잠재 버그)** | job id 접미사로 해소 (D4) |
| local/dev 큐 순서 불일치 | **NULL 정렬이 DB마다 다름 (잠재 버그)** | 명시적 정렬 (D5) |
| 지시문이 모호해 에이전트가 아무것도 안 함 | — | `NO_CHANGE`로 종료. 지시문 고쳐 재시도 |
| 컴파일 실패 | `FAILED` + 로그 꼬리 | 동일 |
| 위임했는데 러너가 오프라인 | — | API가 거부. 큐에 담기지 않는다 |
| `.github/` 수정 시도 | **PR이 열린다** | PR 직전 실패 처리 |
| 항목만 보내 맥락이 없음 | — | 부모 태스크 설명이 항상 실린다 (D11) |
| 항목 하나 맡겼는데 카드 전체를 고침 | — | "다른 항목은 건드리지 않는다"를 프롬프트에 명시 (D11) |
| 맡긴 항목이 그 사이 삭제됨 | — | job은 그대로 실행된다(제목·맥락이 스냅샷). 결과 댓글은 부모 태스크에 남는다 |
| 3개 중 1개 실패 | — | 나머지 2개는 각자 PR까지 간다 (D12) |

---

## 11. 작업 순서

**0단계 (선행·필수).** QA 경로 1건을 실제 맥에서 끝까지 돌린다 (`NO_REPORT=1`).
러너는 아직 실 검증되지 않았다 (`tools/autofix/README.md` 9절). 이 상태에서 범용화를 얹으면
실패했을 때 러너 문제인지 범용화 문제인지 구분할 수 없다.

| 단계 | 내용 | 추정 |
|------|------|------|
| 1 | 마이그레이션 + 엔티티/리포지토리 (D1·D2·D4·D5·D10) | 0.5일 |
| 2 | 러너 스크립트 범용화 + `.github/` 가드 (6절) | 0.5일 |
| 3 | `enqueueManual` + 프롬프트 조립(D11) + 다건 투입(D12) + 통지 분기(D8) | 1일 |
| 4 | 프론트엔드 — 진입점 2곳 + 모달(범위 선택) + 항목 행 상태 칩(D14) + 도크 표시 | 2일 |
| 5 | 검증 — 태스크 1건 · 체크리스트 1건 · 다건 · 실패 후 재시도 | 0.5일 |

1·2단계는 서로 독립이라 병렬 가능. 3은 1에 의존, 4는 3에 의존.
체크리스트 지원으로 3·4단계가 각각 0.5일씩 늘었다 — 범위 선택 UI와 맥락 조립 때문이다.

**테스트.** `JiraAutofixQueueServiceTest`에 추가할 것:

- 우선순위 정렬 — MANUAL이 JIRA보다 앞
- 같은 대상(태스크 / 체크리스트 항목) 중복 투입 차단
- MANUAL은 confidence 임계값을 타지 않음
- MANUAL 완료 시 JIRA 댓글 경로를 타지 않음
- 브랜치 이름 고유성 — 같은 대상을 두 번 맡겨도 다른 브랜치
- 체크리스트 항목 3개 → job 3개, job_key 접두사 `CHK-`
- 다른 태스크의 체크리스트 항목 id를 섞어 보내면 거부
- 프롬프트에 부모 태스크 설명과 "다른 항목은 건드리지 않는다"가 포함

---

## 12. 미결

1. **`job_key` rename 여부** — dev DB `jira_autofix_jobs` 행 수를 먼저 확인. 실 데이터가 이미
   쌓여 있으면 D2를 재검토한다
2. **결과 댓글 작성자** — D8의 BRIDGE 댓글은 시스템 계정으로 달아야 하는데, 자동수정용 봇 사용자를
   새로 만들지 아니면 위임자 이름으로 남길지 (봇 권장 — 사람 이름이면 알림이 자기 자신에게 간다)
3. **`verify_ready=false`일 때 거부 vs 경고 후 허용** — 5절은 거부로 잡았다. 수동 위임은 사람이
   보고 있으므로 경고만 하고 통과시키는 선택지도 있다
4. **도크 자유 입력(진입점 C)** — 카드 없이 잡업무를 맡기는 경로. 지금은 보류
