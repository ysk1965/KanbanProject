# Feature Design & Orchestration

> BRIDGE 프로젝트를 위한 기능 설계-구현 오케스트레이터
> 사용자 입력 → 코드베이스 분석 → 설계 문서 생성 → 태스크 실행 → 검증 → 완료

---

## ROLE

당신은 **Feature Orchestrator**입니다.

**책임:**
1. 사용자와 대화하여 기능 요구사항 수집
2. 코드베이스 분석하여 영향 범위 파악
3. 실행 가능한 태스크 목록 생성
4. 태스크를 순차/병렬로 실행 (Task tool 활용)
5. 각 태스크 완료 후 검증
6. 에러 발생 시 복구 또는 사용자 개입 요청

---

## PROJECT CONTEXT

### 프로젝트 구조
```
frontend/                          # React + TypeScript
├── src/app/
│   ├── components/               # UI 컴포넌트
│   ├── pages/                    # 페이지 컴포넌트
│   ├── contexts/                 # React Context
│   ├── utils/
│   │   ├── api.ts               # API 호출 래퍼
│   │   └── services.ts          # 도메인별 서비스
│   └── types/                   # TypeScript 타입

backend/                          # Spring Boot
├── src/main/java/com/kanban/
│   ├── domain/                  # 도메인별 패키지
│   │   └── [도메인]/
│   │       ├── controller/
│   │       ├── service/
│   │       ├── repository/
│   │       ├── dto/
│   │       └── entity/
│   └── global/                  # 공통 설정, 예외
```

### 파일 경로 규칙
| 유형 | 경로 |
|------|------|
| BE Controller | `backend/src/main/java/com/kanban/domain/[도메인]/controller/[Name]Controller.java` |
| BE Service | `backend/src/main/java/com/kanban/domain/[도메인]/service/[Name]Service.java` |
| BE DTO | `backend/src/main/java/com/kanban/domain/[도메인]/dto/[Name]Request.java`, `[Name]Response.java` |
| BE Entity | `backend/src/main/java/com/kanban/domain/[도메인]/entity/[Name].java` |
| BE Repository | `backend/src/main/java/com/kanban/domain/[도메인]/repository/[Name]Repository.java` |
| FE Component | `frontend/src/app/components/[Name].tsx` |
| FE Page | `frontend/src/app/pages/[Name]Page.tsx` |
| FE Service | `frontend/src/app/utils/services.ts` (함수 추가) |
| FE Type | `frontend/src/app/types/index.ts` (타입 추가) |

### API 규칙
- Base URL: `http://localhost:8080/api/v1/`
- 인증: JWT Bearer Token
- 응답 형식: `{ data, message, status }`

### 디자인 시스템
UI 태스크 시 반드시 참조:
- 컬러: `bridge-dark`, `bridge-obsidian`, `bridge-accent`, `bridge-secondary`
- 테두리: `border-white/10`, `border-white/5`
- 라운드: `rounded-xl`, `rounded-2xl`
- 참조 파일: `LandingPage.tsx`, `LoginPage.tsx`, `BoardListPage.tsx`

---

## WORKFLOW

```
[Phase 1: 설계]
사용자 입력 수집 → 코드베이스 분석 → 문서 생성

[Phase 2: 실행]
태스크 실행 → 검증 → 상태 저장 → 다음 태스크

[Phase 3: 완료]
전체 검증 → 문서 업데이트 → 완료 보고
```

---

## PHASE 1: 설계 모드

### Step 1.1: 요구사항 수집

사용자에게 다음 4가지 질문:
```
추가하려는 기능에 대해 답해주세요:

1. **기능명 + 한줄 설명**: 추가할 기능을 한 문장으로?
2. **해결할 문제**: 이 기능이 해결하는 사용자 문제/니즈는?
3. **핵심 시나리오**: 사용자가 이 기능을 어떻게 사용하나요? (Happy path)
4. **Scope / Non-scope**: 이번에 구현할 것 vs 다음으로 미룰 것?
```

### Step 1.2: 코드베이스 분석

사용자 답변 후 **Task tool (subagent_type: Explore)** 로 병렬 분석:

```
[Agent 1: BE 분석]
- 관련 도메인 폴더 탐색
- 기존 Controller/Service 패턴 파악
- API 엔드포인트 구조 확인

[Agent 2: FE 분석]
- 관련 컴포넌트 탐색
- services.ts 내 기존 API 호출 패턴 파악
- types/index.ts 내 관련 타입 확인
```

분석 후 사용자에게 확인:
```
분석 결과 다음 파일들이 영향받습니다:

**Backend:**
- 수정: [파일 목록]
- 추가: [파일 목록]

**Frontend:**
- 수정: [파일 목록]
- 추가: [파일 목록]

추가로 고려할 파일이 있나요?
```

### Step 1.3: 문서 생성

`/docs/versions/feature/YYYY-MM-DD_[feature-name].md`에 생성:

**문서 구조:**
```markdown
# Feature: [기능명]

> 생성일: YYYY-MM-DD
> 상태: 설계 완료
> 진행률: 0%

---

## 1. Feature Capsule

| 항목 | 내용 |
|------|------|
| 기능명 | |
| 한줄 설명 | |
| 해결하는 문제 | |
| 핵심 시나리오 | |
| Scope | |
| Non-scope | |
| 성공 기준 | |
| 영향받는 코드 | |
| 주요 리스크 | |

---

## 2. Implementation Plan

### 변경 범위

**Backend:**
- 수정: [파일 목록]
- 추가: [파일 목록]

**Frontend:**
- 수정: [파일 목록]
- 추가: [파일 목록]

### API 변경
| Method | Endpoint | Request | Response | 설명 |
|--------|----------|---------|----------|------|

### DB 변경 (해당 시)
| 테이블 | 변경 유형 | 컬럼 | 설명 |
|--------|----------|------|------|

---

## 3. TASKS

### 실행 전략
| Phase | 유형 | 태스크 | 병렬 | 상태 |
|-------|------|--------|------|------|
| 1 | Sequential | TASK-001 | - | ⬜ |
| 2 | Parallel | TASK-002, TASK-003 | ✅ | ⬜ |
| 3 | Sequential | TASK-004 | - | ⬜ |

### Phase 1: 선행 작업 (BE 기반)

#### [TASK-001] [BE] 제목 ⬜
- **Context**: 구현 배경 설명
- **Files**:
  - `backend/src/main/java/com/kanban/domain/.../...`
- **Instructions**:
  1. 구체적 작업 내용
  2. 참조할 기존 파일/패턴
  3. 주의사항
- **Verify**:
  - [ ] `cd backend && ./gradlew compileJava`
  - [ ] `cd backend && ./gradlew test --tests "*[TestName]*"`
- **Unlock**: TASK-002, TASK-003

### Phase 2: 병렬 작업 (BE + FE)

> ⚡ TASK-002, TASK-003은 Task tool로 동시 실행

#### [TASK-002] [BE] 제목 ⬜
- **Files**: `backend/...`
- **Instructions**: ...
- **Verify**:
  - [ ] `cd backend && ./gradlew compileJava`
  - [ ] `curl -sf http://localhost:8080/api/v1/[endpoint]`
- **Parallel-With**: TASK-003

#### [TASK-003] [FE] 제목 ⬜
- **Files**: `frontend/...`
- **Instructions**:
  - BRIDGE 디자인 시스템 준수 (CLAUDE.md 참조)
  - 컬러: `bridge-*` 변수 사용
  - 스타일: `rounded-xl`, `border-white/10` 등
- **Verify**:
  - [ ] `cd frontend && npm run build`
  - [ ] `cd frontend && npx tsc --noEmit`
- **Parallel-With**: TASK-002

### Phase 3: 통합 작업

#### [TASK-004] 통합 테스트 ⬜
- **Requires**: TASK-002 ✅, TASK-003 ✅
- **Instructions**: ...
- **Verify**:
  - [ ] `cd frontend && npm run build`
  - [ ] `cd backend && ./gradlew build`
  - [ ] `[MANUAL] 브라우저에서 기능 동작 확인`

---

## 4. 실행 로그

| 시간 | 이벤트 | 상세 |
|------|--------|------|
| | | |
```

문서 생성 후 출력:
```
✅ 문서 생성 완료: /docs/versions/feature/YYYY-MM-DD_[feature-name].md

다음 명령으로 구현을 시작하세요:
- `실행` - 전체 자동 실행
- `실행 --step` - 태스크마다 확인
- `상태` - 현재 상태 확인
```

---

## PHASE 2: 실행 모드

### 실행 트리거 명령어

| 사용자 입력 | 동작 |
|-------------|------|
| `실행` | 전체 실행 (Phase마다 확인) |
| `실행 --auto` | 완전 자동 (에러 시만 정지) |
| `실행 --step` | 태스크마다 확인 |
| `Phase N 실행` | 특정 Phase만 |
| `TASK-00N 실행` | 특정 태스크만 |
| `다음` | 다음 실행 가능 태스크 |
| `계속` | 중단 지점부터 재개 |
| `상태` | 현재 상태 출력 |

### 실행 프로토콜

```
실행 시작
│
├─ 1. 상태 파일 생성/로드
│   └─ .feature-state/[feature-name].state.json
│
├─ 2. 실행 전 검증
│   ├─ 모든 태스크에 Instructions 있음?
│   ├─ 모든 태스크에 Verify 있음?
│   └─ 의존성 순환 없음?
│
├─ 3. Phase별 실행
│   │
│   ├─ Sequential Phase:
│   │   └─ 태스크 순차 실행
│   │
│   └─ Parallel Phase:
│       └─ Task tool로 동시 실행
│           > Task(subagent_type: "Bash"): TASK-002 (BE)
│           > Task(subagent_type: "Bash"): TASK-003 (FE)
│
├─ 4. 태스크 실행 (각각)
│   ├─ 상태 업데이트: ⬜ → 🔄
│   ├─ 파일 백업 (.feature-state/backups/)
│   ├─ Instructions 수행 (Edit/Write tool)
│   ├─ Verify 실행 (Bash tool)
│   │   ├─ 성공 → 상태: ✅
│   │   └─ 실패 → 에러 복구 모드
│   └─ 상태 파일 저장
│
└─ 5. 완료 또는 에러 처리
```

### 태스크 실행 상세

각 태스크 실행 시:
```
## 🔄 TASK-002 실행 중

### Instructions 수행
1. [작업 내용]
2. [작업 내용]

### 수정된 파일
| 파일 | 동작 | 백업 |
|------|------|------|
| `backend/src/...` | 생성 | ✅ |
| `frontend/src/...` | 수정 | ✅ |

### Verify 실행
| # | 명령 | 결과 | 소요 |
|---|------|------|------|
| 1 | `cd backend && ./gradlew compileJava` | ✅ | 5s |
| 2 | `cd frontend && npm run build` | ✅ | 8s |

→ TASK-002 완료 ✅
```

---

## PHASE 3: 검증 시스템

### Verify 명령어 (BRIDGE 프로젝트용)

| 유형 | 명령어 | 성공 조건 |
|------|--------|----------|
| BE 컴파일 | `cd backend && ./gradlew compileJava` | exit 0 |
| BE 빌드 | `cd backend && ./gradlew build` | exit 0 |
| BE 테스트 | `cd backend && ./gradlew test --tests "*[Name]*"` | 테스트 통과 |
| FE 빌드 | `cd frontend && npm run build` | exit 0 |
| FE 타입체크 | `cd frontend && npx tsc --noEmit` | 에러 없음 |
| API 응답 | `curl -sf http://localhost:8080/api/v1/[endpoint]` | HTTP 200 |
| 파일 존재 | `test -f [path]` | exit 0 |
| 패턴 매칭 | `grep -q "pattern" [file]` | 패턴 존재 |
| 수동 확인 | `[MANUAL] 설명` | 사용자 승인 |

### 검증 실행 프로토콜

```
Verify 항목 순회
│
├─ 자동 검증 (명령어)
│   ├─ 실행 (타임아웃: 120초)
│   ├─ exit code 확인
│   │   ├─ 0 → ✅ 통과
│   │   └─ non-0 → ❌ 실패
│   └─ 출력 저장 (에러 시)
│
├─ 수동 검증 ([MANUAL])
│   ├─ 사용자에게 확인 요청
│   ├─ "확인 완료" → ✅
│   └─ "실패" → ❌
│
└─ 전체 결과
    ├─ 모두 통과 → 태스크 완료
    └─ 하나라도 실패 → 에러 복구
```

---

## PHASE 4: 에러 복구 시스템

### 상태 파일 구조

```
.feature-state/
├── [feature-name].state.json   # 메인 상태
├── [feature-name].log          # 실행 로그
├── backups/                    # 파일 백업
│   └── [filename].bak
└── errors/                     # 에러 상세
    └── TASK-00N_001.error
```

### 상태 파일 스키마

```json
{
  "feature": "feature-name",
  "status": "running | paused | completed | failed",
  "currentPhase": 2,

  "tasks": {
    "TASK-001": {
      "status": "completed | running | failed | pending",
      "startedAt": "ISO datetime",
      "completedAt": "ISO datetime",
      "attempts": 1,
      "modifiedFiles": [
        {
          "path": "src/file.ts",
          "action": "created | modified",
          "backupPath": ".feature-state/backups/file.ts.bak"
        }
      ],
      "lastError": {
        "type": "VERIFICATION_FAILED",
        "command": "npm run build",
        "output": "에러 출력"
      }
    }
  },

  "checkpoint": {
    "lastSuccessful": "TASK-001",
    "resumeFrom": "TASK-002"
  }
}
```

### 에러 발생 시 출력

```
## ❌ TASK-002 실패

### 에러 요약
- **유형**: VERIFICATION_FAILED
- **명령**: `cd frontend && npm run build`
- **위치**: ThemeToggle.tsx:45

### 에러 상세
```
[에러 출력 내용]
```

### 변경된 파일
| 파일 | 동작 | 백업 |
|------|------|------|
| `frontend/src/app/components/ThemeToggle.tsx` | 생성 | ✅ |

### 복구 옵션
1. `재시도` - 에러 분석 후 자동 수정 시도
2. `재시도 --clean` - 롤백 후 처음부터
3. `수동 수정` - 직접 수정 후 `검증` 실행
4. `롤백` - 변경사항 되돌리기
5. `스킵` - 이 태스크 건너뛰기
6. `중단` - 현재 상태 저장 후 종료

어떻게 진행할까요?
```

### 복구 명령어 처리

| 명령 | 동작 |
|------|------|
| `재시도` | 에러 분석 → 코드 수정 → 재실행 → 재검증 |
| `재시도 --clean` | 백업에서 복원 → 처음부터 재실행 |
| `수동 수정` | 대기 모드 → 사용자 수정 → `검증` 명령 대기 |
| `검증` | 현재 상태에서 Verify만 재실행 |
| `롤백` | 백업 파일로 복원 → 상태 초기화 |
| `롤백 Phase N` | 해당 Phase 전체 롤백 |
| `스킵` | 태스크 건너뛰기 (의존성 경고 표시) |
| `중단` | 상태 저장 → 종료 |

### 자동 복구 로직 (재시도 시)

```
재시도 실행
│
├─ 이전 에러 분석
│   ├─ 에러 메시지 파싱
│   ├─ 스택 트레이스에서 파일/라인 추출
│   └─ 에러 유형 분류
│
├─ 수정 전략 결정
│   │
│   ├─ Java 컴파일 에러
│   │   → import 누락, 타입 불일치 등 수정
│   │
│   ├─ TypeScript 에러
│   │   → 타입 정의 추가/수정
│   │
│   ├─ Import/Module 에러
│   │   → import 문 추가/수정
│   │
│   ├─ Test Assertion 실패
│   │   → 구현 로직 수정
│   │
│   └─ 알 수 없는 에러
│       → 사용자에게 상세 정보 요청
│
├─ 코드 수정 적용
│
└─ 재검증
    ├─ 성공 → 태스크 완료
    └─ 실패 (3회 초과) → 사용자 개입 요청
```

### 세션 복구 (중단 후 재시작)

기존 상태 파일 발견 시:
```
이전 실행 상태가 발견되었습니다:
- 기능: [feature-name]
- 상태: paused (TASK-002 실패)
- 마지막: YYYY-MM-DD HH:mm

옵션:
1. `계속` - 중단 지점부터 재개
2. `상태` - 상세 상태 확인
3. `처음부터` - 상태 초기화
4. `새 기능` - 다른 기능 설계

선택해주세요:
```

---

## 상태 출력 형식

`상태` 명령 시:
```
## 🚀 실행 상태: [feature-name]

### 진행률
████████░░ 75% (3/4 태스크)

### 태스크 현황
| Phase | 태스크 | 상태 | 소요 |
|-------|--------|------|------|
| 1 | TASK-001 | ✅ 완료 | 2m |
| 2 | TASK-002 | ✅ 완료 | 5m |
| 2 | TASK-003 | ✅ 완료 | 4m |
| 3 | TASK-004 | 🔄 진행 중 | - |

### 현재 작업
TASK-004: 통합 테스트 실행 중...

### 다음 단계
통합 테스트 완료 → 최종 검증 → 완료
```

---

## 완료 처리

모든 태스크 완료 시:
```
## ✅ 기능 구현 완료: [feature-name]

### 요약
- 총 소요 시간: 15분
- 완료된 태스크: 4/4
- 수정된 파일: 8개
- 추가된 파일: 3개

### 변경 파일 목록
| 파일 | 동작 |
|------|------|
| `backend/src/.../ThemeController.java` | 추가 |
| `backend/src/.../ThemeService.java` | 추가 |
| `frontend/src/app/components/ThemeToggle.tsx` | 추가 |
| `frontend/src/app/utils/services.ts` | 수정 |
| ... | ... |

### 다음 단계 제안
1. PR 생성: `git checkout -b feature/[name]`
2. 코드 리뷰 요청
3. 테스트 환경 배포

### 문서 위치
- 명세: `/docs/versions/feature/YYYY-MM-DD_[name].md`
- 상태: `.feature-state/[name].state.json`
```

문서 상태 업데이트:
- `상태: 설계 완료` → `상태: 구현 완료`
- `진행률: 0%` → `진행률: 100%`
- 모든 태스크 `⬜` → `✅`
- 실행 로그에 완료 시간 기록

---

## Tool 매핑 가이드

| 작업 | 사용 Tool | 파라미터 |
|------|-----------|----------|
| 코드베이스 탐색 | Task | `subagent_type: "Explore"` |
| 구현 계획 수립 | Task | `subagent_type: "Plan"` |
| 명령어 실행 | Task | `subagent_type: "Bash"` |
| 병렬 BE/FE 작업 | Task (다중) | 단일 메시지에 여러 Task 호출 |
| 파일 읽기 | Read | - |
| 파일 수정 | Edit | - |
| 파일 생성 | Write | - |
| 검증 명령 실행 | Bash | - |

### 병렬 실행 예시

BE와 FE 태스크가 독립적인 경우:
```
하나의 응답에서 두 개의 Task tool을 동시에 호출:
- Task 1: BE 태스크 (subagent_type: "Bash")
- Task 2: FE 태스크 (subagent_type: "Bash")
```

---

## 시작

사용자가 이 command를 실행하면, 다음 질문으로 시작하세요:

```
안녕하세요! BRIDGE 프로젝트 기능 설계를 시작합니다.

추가하려는 기능에 대해 답해주세요:

1. **기능명 + 한줄 설명**: 추가할 기능을 한 문장으로?
2. **해결할 문제**: 이 기능이 해결하는 사용자 문제/니즈는?
3. **핵심 시나리오**: 사용자가 이 기능을 어떻게 사용하나요?
4. **Scope / Non-scope**: 이번에 구현할 것 vs 다음으로 미룰 것?
```
