# JIRA ⇄ BRIDGE QA 이슈 양방향 동기화 — 개발 계획

> 작성일: 2026-07-15 · 대상 보드: 오토배틀러 프로젝트(`7ec963c8-…`) · 연동: `cookapps-interactive.atlassian.net / QASA`

## 1. 배경 · 목표

- **QA 팀은 JIRA**로 이슈를 관리(회사 표준 Atlassian, 버전/빌드 프로세스가 JIRA에 종속) → JIRA를 떠날 수 없음.
- **개발 팀은 BRIDGE**로 관리.
- **목표**: 두 도구가 각자 맥락을 유지한 채, 한 이슈의 상태가 **자동으로 오가도록** 동기화.
- **범위 결정(확정)**:
  - ❌ 별도 QA 전용 보드를 새로 만들지 않는다.
  - ✅ **기존 프로젝트(보드) 안에서** JIRA 이슈를 관리한다.
  - 개발은 **할 일 / 작업 중 / 작업 완료**만 관리, QA의 **검토중 / 완료**는 읽기전용으로 비친다.

## 2. 핵심 원칙

### 2.1 프로젝트 내 관리 (별도 보드 X)
- JIRA 프로젝트(QASA) = 보드 안의 **Feature 1개** (`QA · QASA`). *(현재 import가 이미 프로젝트→Feature로 그룹핑)*
- JIRA 이슈 = 그 Feature 하위 **Task 카드**. 기존 블록(Task/Sprint/In Review/Done)을 그대로 흐른다.
- 게임 콘텐츠 카드와 한 보드에 **섞이되**, JIRA 카드는 시각적으로 구분(좌측 파란 띠 + `JIRA` 뱃지).

### 2.2 상태 소유권 (directional sync)
양방향 동기화의 충돌·루프를 막기 위해 **단계별로 방향을 고정**한다.

| 단계 | 소유 | 진실의 원천 | 방향 |
|------|------|-------------|------|
| 할 일 · 작업 중 · 작업 완료 | 개발팀 | BRIDGE | **push** (BRIDGE→JIRA) |
| 검토중 · 완료 | QA팀 | JIRA | **pull** (JIRA→BRIDGE, 읽기전용) |
| 반려 | QA팀 | JIRA | **pull** → BRIDGE 작업 중 복귀 + 사유 |

### 2.3 소유권은 "컬럼"이 아니라 "카드(출처)"가 가진다
- 블록은 게임/QA 카드가 공유하므로, 컬럼 단위로 소유권을 걸 수 없다.
- JIRA 카드가 **출처·동기화 상태·QA 상태**를 카드에 달고 다닌다.

### 2.4 필드 소유권 (덮어쓰기 방지)
| 필드 | 원천 | 재동기화 시 |
|------|------|-------------|
| 제목 · 설명 | JIRA | 갱신(pull) |
| 상태(블록) | 단계별 방향 | push/pull |
| 담당자 | 각자 유지(최초 매핑) | 갱신 안 함 |
| 체크리스트 | BRIDGE | JIRA 미반영 |
| 빌드/버전(선택) | 개발 지정 | push |

---

## 3. 데이터 모델

### 3.1 기존 자산 (그대로 사용)
- `JiraIntegrationConfig` — 보드별 연동 설정. 이미 보유: `statusToBlockJson`(JIRA→블록), `writeBackEnabled`, `writeBackTargetStatusId`, OAuth 토큰(TEXT).
- `JiraIssueLink` — 이슈 원장(`jiraIssueKey ↔ targetType/targetId`, `jiraUpdatedAt`, `writeBackDoneAt`). 중복/역참조/고아 재조정에 사용.
- `JiraUserMapping` — accountId ↔ BRIDGE 멤버.

### 3.2 신규/확장
1. **블록 ↔ JIRA status 양방향 매핑** *(기존 `statusToBlockJson` 확장)*
   ```jsonc
   // block_status_map (예)
   {
     "<taskBlockId>":   { "jiraStatusId": "10000", "dir": "push" },   // 할 일
     "<sprintBlockId>": { "jiraStatusId": "10001", "dir": "push" },   // 작업 중
     "<doneBlockId>":   { "jiraStatusId": "10002", "dir": "push" },   // 작업 완료(핸드오프)
     "<reviewBlockId>": { "jiraStatusId": "10003", "dir": "pull" },   // 검토중(읽기전용)
     "__verified":      { "jiraStatusId": "10004", "dir": "pull" },   // 완료
     "__rejected":      { "jiraStatusId": "10005", "returnBlockId": "<sprintBlockId>" } // 반려→작업중
   }
   ```
2. **Task에 QA 반영 필드**(읽기전용): `qa_state`(NULL|REVIEW|VERIFIED|REJECTED), `qa_synced_at`.
3. **동기화 출처 플래그**: 상태 변경이 sync에서 발생했는지 표시 → push↔pull 에코 방지(트랜잭션 스코프 플래그 또는 `jiraUpdatedAt` 비교).
4. *(선택)* Task `target_build` — 빌드/버전 왕복용(1차 범위 밖, 나중).

---

## 4. UI / UX 사양

### 4.1 보드 내 표현
- **Feature 그룹**: `QA · QASA` Feature로 이슈 묶임.
- **JIRA 카드 구분**: 카드 좌측 파란 띠(`border-left: 3px solid jira`) + `🐞 JIRA` 뱃지 + JIRA 키.
- **카드 동기화 상태**: `J 동기화됨` / `동기화 중…(spinner)` / `동기화 실패 · 재시도`.
- **QA 상태 뱃지**(pull): `QA 검토중`(파랑) / `✓ QA 완료`(초록) / `↩ 반려됨`(로즈).
- **반려 배너**: 반려 시 카드에 사유(JIRA 댓글) 표시 + 작업 중 블록으로 복귀.

### 4.2 포커스 뷰 (같은 보드 안 QA 전용)
- 필터바에 **`🔗 JIRA 연동만`** 칩 추가 → 켜면 비-JIRA 카드는 흐려지고 QA 이슈만 포커스.
- 기존 `Feature` 필터로 `QA · QASA`만 골라도 동일. *(FE `useBoardFilters` 확장)*

### 4.3 진입 (별도 보드 아님)
- 새 진입점 불필요 — 늘 쓰던 프로젝트에서 **필터/Feature**로 접근.
- **알림 딥링크**(중요): QA 반려/검토 시작 → BRIDGE 알림 → 클릭하면 **해당 카드로 직행**.

### 4.4 상호작용 규칙
- 개발: 할일→작업중→작업완료 이동 가능(이동 시 즉시 UI + 백그라운드 push, 실패 시 재시도).
- QA 상태(검토중/완료): 카드에서 **개발이 직접 못 옮김**(읽기전용). JIRA에서만 변경 → pull 반영.
- 이동은 **낙관적 UI**(기다리지 않음) + 카드 동기화 상태로 결과 표시.

---

## 5. 동기화 로직

### 5.1 PUSH (BRIDGE → JIRA)
- 트리거: BRIDGE에서 Task 블록 이동(할일/작업중/작업완료 매핑 블록).
- 처리: 매핑된 `jiraStatusId`로 **JIRA transition 실행**(`JiraApiClient` transitions API).
- 기존 `JiraWriteBackService`(완료 1개만)를 **블록별 전환**으로 일반화.
- 지연: 개발 액션을 우리가 잡으므로 **몇 초 내**.
- 루프 방지: transition 후 `jiraUpdatedAt` 갱신, 다음 pull에서 무시.

### 5.2 PULL (JIRA → BRIDGE)
- 감지: 초기 **`JiraSyncScheduler` 폴링**(N분) → 이후 **JIRA 웹훅**(근실시간).
- 처리: 기존 태스크의 JIRA status 변화를 **업서트 재동기화**에 얹어 반영:
  - 검토중/완료 → `qa_state` 갱신 + 읽기전용 뱃지(블록은 개발 영역 유지).
  - 반려 → 매핑 `returnBlockId`(작업 중)로 이동 + `qa_state=REJECTED` + JIRA 반려 댓글 pull.
- BRIDGE 자체 WebSocket으로 **열려있는 개발자 화면 실시간 갱신**.

### 5.3 실시간 체인 (웹훅 완성 시)
```
QA가 JIRA 변경 → (JIRA 웹훅) → BRIDGE 반영 → (BRIDGE WebSocket) → 개발자 화면 갱신
```

### 5.4 충돌 해소
- 규칙: **상태 소유권 우선** + 동률 시 `updatedAt` 최신 우선.
- 개발 소유 상태는 pull이 덮지 않음, QA 소유 상태는 push하지 않음.

---

## 6. 구현 단계

| Phase | 내용 | 기존 ✅ / 신규 🔨 |
|-------|------|------------------|
| **0. 합의** | QA 실제 status·transition ID 수집 → 블록↔status 매핑표·반려 status·JQL 확정 | ✅ status/transition 조회 API · 🔨 매핑표 승인 |
| **1. 매핑 인프라** | 블록↔statusId+방향 스키마 + 설정 UI. `writeBackTargetStatusId` 일반화 | ✅ statusToBlock · 🔨 양방향 스키마·UI |
| **2. Push** | 블록 이동 → transition 호출, 루프 방지, 재시도/로그 | ✅ WriteBackService(완료) · 🔨 블록별 push |
| **3. Pull** | JIRA status 변화 감지·반영(QA 뱃지/반려 복귀/사유 댓글) | ✅ 업서트·스케줄러 뼈대 · 🔨 status 반영·반려 |
| **4. 근실시간+충돌** | JIRA 웹훅 콜백, 소유권+updatedAt 충돌 해소, 필드 소유권 적용 | 🔨 웹훅·충돌 규칙 |
| **5. 파일럿·롤아웃** | 이 보드로 3~5일 운영·조정 → 안정화 | 🔨 모니터링·확대 |

**시작점: Phase 0 매핑표를 QASA 실제 status로 채우는 것** — 확정되면 나머지는 기계적으로 붙는다.

---

## 7. 코드 터치포인트 (참고)

- 백엔드
  - `domain/integration/jira/JiraIntegrationConfig.java` — 매핑 스키마 확장, `qa_state`용 반영은 Task 측.
  - `domain/integration/jira/service/JiraImportService.java` — 업서트에 status 반영·반려 처리 추가.
  - `domain/integration/jira/service/JiraWriteBackService.java` — 완료 전용 → 블록별 push 일반화.
  - `domain/integration/jira/service/JiraSyncScheduler.java` — pull 폴링 추가(현재 write-back만).
  - `domain/integration/jira/service/JiraApiClient.java` — transitions/getProjectStatuses 활용, 웹훅 수신은 신규 컨트롤러.
  - `domain/task/Task.java` — `qaState`/`qaSyncedAt` 필드 + 도메인 메서드.
  - 신규: `JiraWebhookController` (`/api/v1/jira/webhook`) — 서명 검증 + pull 트리거.
  - Flyway: 블록↔status 매핑 컬럼/테이블 + Task `qa_state` 마이그레이션(타임스탬프 버전, 멱등).
- 프론트엔드
  - `components/JiraSettingsPanel.tsx` — 블록↔status 매핑 UI.
  - `hooks/useBoardFilters` — `JIRA 연동만` 필터/포커스 뷰.
  - 카드 컴포넌트(DraggableCard 등) — JIRA 뱃지·동기화 상태·QA 뱃지·반려 배너.
  - 알림 → 카드 딥링크 라우팅.

---

## 8. 오픈 이슈 · 리스크

- **QA 워크플로 status 확정 필요**: QASA의 실제 status/transition ID를 Phase 0에서 조회해야 매핑이 완성됨.
- **반려 status 정의**: QA가 어떤 status로 반려하는지 합의 필요(전용 status vs 작업중 되돌림).
- **웹훅 신뢰성**: 유실 대비 폴링을 백업으로 유지(웹훅 + 주기 reconcile 병행).
- **공유 블록의 혼재**: 게임/QA 카드가 같은 블록을 씀 → 필터/Feature로 뷰 분리(데이터는 통합).
- **빌드/버전 왕복**은 1차 범위 밖(별도 단계). fixVersion은 버전명 단위 유지, 빌드 예외는 댓글/선택 필드.

---

## 9. 한 줄 요약

> **새 보드를 만들지 않고**, 기존 프로젝트 안에서 JIRA 프로젝트를 Feature로 흡수한다. 개발은 할일/작업중/작업완료만 관리해 JIRA로 push하고, QA의 검토중/완료/반려는 읽기전용으로 pull된다. 소유권은 카드가 갖고, 웹훅까지 붙이면 양방향 근실시간이 된다.
