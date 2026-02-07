---
model: sonnet
---

# 버전 문서 업데이트

## 목표
이전 버전 대비 변경 사항을 파악하여 Design 문서(4개)와 Tech 문서(3개)의 다음 버전을 생성합니다.

---

## Phase 0: 컨텍스트 모드 판별

실행 시작 시 **현재 모델 상태를 확인**한 후 사용자에게 안내:

### 판별 방법
시스템 프롬프트 또는 환경에서 현재 모델 정보를 확인.
`sonnet[1m]` 또는 1M 컨텍스트가 활성화된 상태인지 판별.

### Case 1: 이미 `sonnet[1m]` 상태인 경우
```
✅ 1M 컨텍스트 모드 감지. 풀 컨텍스트 모드로 문서를 생성합니다.
```
→ Phase 1A (전량 로드) 자동 진행

### Case 2: `sonnet[1m]`이 아닌 경우
AskUserQuestion 도구로 다음을 질문:

**질문**: "1M 풀 컨텍스트 모드를 사용하시겠습니까?"
**옵션**:
1. **1M 모드로 전환 후 진행 (권장)** — 소스코드 전량 적재, 높은 정확도. `/model sonnet[1m]` 전환 후 `/write-docs` 재실행이 필요합니다.
2. **현재 모델로 바로 진행** — 선별 로드 + 서브에이전트 분산. 바로 시작 가능하지만 일부 정보 누락 가능.

- 사용자가 **1**을 선택하면 → "아래 명령어를 순서대로 입력해주세요:" 안내 후 중단
  ```
  /model sonnet[1m]
  /write-docs
  ```
- 사용자가 **2**를 선택하면 → Phase 1B (선별 로드) 바로 진행

---

## 문서 구조 (v8.0+)

### Design 문서 (4개 파일)
```
/docs/versions/design/vX.X/
├── overview.md       # 서비스 개요, 비즈니스 모델, 회원/권한 시스템
├── features.md       # 블록, 카드, 마일스톤, 스케줄, 통계, 설정 기능
├── ia.md             # 화면 목록, 네비게이션, 사용자 흐름, 에러 상태
└── design-system.md  # 컬러, 타이포그래피, 컴포넌트, 애니메이션
```

### Tech 문서 (3개 파일)
```
/docs/versions/tech/vX.X/
├── architecture.md   # 기술 스택, 프로젝트 구조, 엔티티 관계도, API 구조
├── backend.md        # 엔티티, API 명세, 서비스 로직, SQL 마이그레이션
└── frontend.md       # 타입 정의, API 클라이언트, Context, 컴포넌트
```

---

## Phase 1A: 전량 로드 (1M 컨텍스트 모드)

> 이 모드는 `sonnet[1m]` 에서만 사용. 소스코드와 이전 문서를 모두 컨텍스트에 적재합니다.

### 1.1 현재 버전 파악
1. `/docs/versions/design/` 디렉토리에서 최신 버전 폴더 확인
2. `/docs/versions/tech/` 디렉토리에서 최신 버전 폴더 확인
3. 다음 버전 번호 결정 (예: v9.0 → v10.0)

### 1.2 이전 버전 문서 전량 로드 (병렬)
**7개 파일을 한 번에 모두 읽기**:

- `docs/versions/design/vX.X/overview.md`
- `docs/versions/design/vX.X/features.md`
- `docs/versions/design/vX.X/ia.md`
- `docs/versions/design/vX.X/design-system.md`
- `docs/versions/tech/vX.X/architecture.md`
- `docs/versions/tech/vX.X/backend.md`
- `docs/versions/tech/vX.X/frontend.md`

### 1.3 소스코드 전량 로드 (병렬)
**모든 소스 파일을 직접 읽기** — 요약/추출 없이 원본 코드 그대로 적재:

**Backend 전체 스캔**:
```
backend/src/main/java/com/kanban/domain/**/  → 모든 .java 파일
backend/src/main/java/com/kanban/global/**/  → 모든 .java 파일
backend/src/main/resources/application*.yml
backend/src/main/resources/db/migration/     → SQL 마이그레이션 파일
```

**Frontend 전체 스캔**:
```
frontend/src/app/types/index.ts
frontend/src/app/utils/api.ts
frontend/src/app/utils/services.ts
frontend/src/app/utils/dateUtils.ts
frontend/src/app/contexts/**/*.{ts,tsx}
frontend/src/app/pages/**/*.{ts,tsx}
frontend/src/app/components/**/*.{ts,tsx}     → 모든 컴포넌트
frontend/src/styles/theme.css
frontend/tailwind.config.*
frontend/package.json
```

**읽기 전략**:
- Glob으로 파일 목록을 먼저 확보한 후, Read 도구로 병렬 읽기
- 파일당 최대 2000줄까지 읽기 (Read 기본값)
- 이미지, node_modules, build 결과물은 제외

→ 로드 완료 후 **Phase 2**로 이동

---

## Phase 1B: 선별 로드 (표준 컨텍스트 모드)

> 200K 컨텍스트에서 동작. 핵심 파일만 직접 읽고, 나머지는 서브에이전트에게 위임합니다.

### 1.1 현재 버전 파악
Phase 1A와 동일.

### 1.2 이전 버전 문서 읽기 (병렬)
7개 파일 모두 읽기 (문서 파일은 크기가 작으므로 200K에서도 가능)

### 1.3 변경 사항 탐색 (서브에이전트 병렬)
Task 도구로 3개 서브에이전트를 병렬 실행:

**에이전트 1: Backend 분석** (subagent_type: Explore)
```
backend/src/main/java/com/kanban/domain/ 전체를 탐색하여:
1. 모든 엔티티 클래스의 필드, 관계, 어노테이션 목록
2. 모든 Controller의 API 엔드포인트 (메서드, URL, 파라미터, 응답)
3. 모든 Service의 핵심 메서드 시그니처와 비즈니스 로직 요약
4. Repository 커스텀 쿼리 목록
5. 새로 추가된 도메인/패키지
결과를 구조화된 목록으로 반환.
```

**에이전트 2: Frontend 분석** (subagent_type: Explore)
```
frontend/src/app/ 전체를 탐색하여:
1. types/index.ts의 모든 타입/인터페이스 정의
2. utils/api.ts의 모든 API 함수 시그니처
3. utils/services.ts의 모든 서비스 함수 시그니처
4. contexts/의 모든 Context와 Provider
5. pages/의 모든 페이지 컴포넌트 구조
6. components/의 모든 컴포넌트 목록과 props
결과를 구조화된 목록으로 반환.
```

**에이전트 3: 디자인 시스템 분석** (subagent_type: Explore)
```
프론트엔드 디자인 관련 파일을 탐색하여:
1. frontend/src/styles/theme.css의 모든 CSS 변수
2. frontend/tailwind.config.*의 커스텀 설정
3. 주요 컴포넌트의 스타일 패턴 (클래스명, 색상, 타이포그래피)
4. 애니메이션/트랜지션 정의
결과를 구조화된 목록으로 반환.
```

→ 서브에이전트 결과 취합 후 **Phase 2**로 이동

---

## Phase 2: 변경 사항 분석

### 2.1 Git 기반 변경 탐지
```bash
# 이전 문서 버전 날짜 이후의 모든 커밋 확인
git log --since="이전 버전 날짜" --oneline --stat

# 변경된 파일 목록
git diff --name-only 이전버전태그..HEAD
```

### 2.2 코드 vs 문서 비교
컨텍스트에 적재된 데이터(1M) 또는 서브에이전트 결과(표준)를 이전 문서와 비교하여 다음을 식별:

- **신규 기능**: 이전 문서에 없는 새 엔티티, API, 컴포넌트
- **변경 사항**: 코드와 문서가 불일치하는 부분 (시그니처 변경, 로직 변경)
- **제거 사항**: 문서에는 있지만 코드에서 삭제된 기능
- **버그 수정**: 로직 수정이 반영되지 않은 문서 내용
- **UI/UX 개선**: 컴포넌트 스타일/구조 변경

### 2.3 변경 사항 확인
사용자에게 변경사항 요약을 보여주고 확인을 받은 후 Phase 3로 진행.

---

## Phase 3: 문서 생성

> **1M 모드**: 서브에이전트 없이, 풀 컨텍스트 기반으로 직접 7개 파일을 순차 생성 (일관성 보장)
> **표준 모드**: 동일하게 순차 생성하되, 서브에이전트가 수집한 데이터 기반

### 생성 순서
1. **architecture.md** → 전체 구조 파악 기반 (다른 문서의 참조 프레임)
2. **backend.md** → 엔티티, API 명세 (소스코드 직접 참조)
3. **frontend.md** → 타입, 컴포넌트 (소스코드 직접 참조)
4. **overview.md** → 서비스 개요 (아키텍처 + 비즈니스 관점)
5. **features.md** → 기능 명세 (BE + FE 통합 관점)
6. **ia.md** → 정보 구조 (페이지/컴포넌트 기반)
7. **design-system.md** → 디자인 시스템 (CSS/컴포넌트 코드 기반)

### 각 문서 생성 시 규칙
- 이전 버전 내용을 베이스로 하되, **코드 기반으로 사실 검증**
- 코드에서 확인되지 않는 내용은 제거하거나 수정
- 실제 코드 시그니처/구조와 정확히 일치하도록 작성
- 변경된 부분에 `← vX.X 변경/추가/제거` 주석

---

## 문서별 세부 구조

### Design 문서

#### overview.md
```markdown
# BRIDGE - 서비스 개요 vX.X

## 1. 서비스 개요
### 1.1 프로젝트 목적
### 1.2 핵심 가치 제안
### 1.3 핵심 컨셉
### 1.4 서비스 구조

## 2. 비즈니스 모델
### 2.1 보드 등급
### 2.2 가격 정책
### 2.3 Premium 전환 UX

## 3. 회원 및 권한 시스템
### 3.1 역할 정의
### 3.2 권한 매트릭스
### 3.3 인증 흐름

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

#### features.md
```markdown
# BRIDGE - 기능 명세 vX.X

## 1. 블록 시스템
## 2. 카드 시스템 (Feature/Task)
## 3. 마일스톤 시스템
## 4. 마일스톤 할당 시스템
## 5. 관리 대시보드
## 6. 통계 분석 시스템
## 7. 위클리 스케줄 시스템
## 8. 데일리 스케줄 시스템
## 9. 가중치/임팩트 시스템
## 10. 설정 기능
## 11. 핵심 규칙 요약

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

#### ia.md
```markdown
# BRIDGE - 정보 구조 (IA) vX.X

## 1. 화면 인벤토리
### 1.1 인증 흐름 화면
### 1.2 메인 화면
### 1.3 모달/다이얼로그

## 2. 네비게이션 구조
### 2.1 글로벌 네비게이션
### 2.2 보드 내 네비게이션

## 3. 사용자 흐름
### 3.1 신규 가입 흐름
### 3.2 로그인 흐름
### 3.3 보드 생성 흐름
### 3.4 Task 생성 흐름
### 3.5 비밀번호 재설정 흐름

## 4. 에러 및 예외 상태
### 4.1 인증 에러
### 4.2 권한 에러
### 4.3 네트워크 에러

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

#### design-system.md
```markdown
# BRIDGE - 디자인 시스템 vX.X

## 1. 컬러 팔레트
### 1.1 메인 컬러
### 1.2 시맨틱 컬러
### 1.3 다크/라이트 모드

## 2. 타이포그래피
### 2.1 폰트 패밀리
### 2.2 텍스트 스타일

## 3. 컴포넌트
### 3.1 버튼
### 3.2 입력 필드
### 3.3 카드
### 3.4 모달

## 4. 레이아웃
### 4.1 그리드 시스템
### 4.2 간격 체계

## 5. 애니메이션
### 5.1 트랜지션
### 5.2 마이크로 인터랙션

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

---

### Tech 문서

#### architecture.md
```markdown
# BRIDGE - 아키텍처 개요 vX.X

## 1. 기술 스택
### 1.1 Frontend
### 1.2 Backend
### 1.3 Infrastructure

## 2. 프로젝트 구조
### 2.1 Frontend 구조
### 2.2 Backend 구조

## 3. 엔티티 관계도

## 4. API 구조
### 4.1 Base URL
### 4.2 API 그룹
### 4.3 인증 방식

## 5. 데이터베이스 스키마 개요
### 5.1 주요 테이블
### 5.2 인덱스 전략

## 6. 보안 설정

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

#### backend.md
```markdown
# BRIDGE - Backend 기술 문서 vX.X

## 1. 핵심 변경사항 (vX.X)

## 2. 엔티티 정의
### 2.1 User 도메인
### 2.2 Board 도메인
### 2.3 Task/Feature 도메인
### 2.4 Schedule 도메인
### 2.5 Statistics 도메인
### 2.6 (새 도메인 추가 시)

## 3. Repository 쿼리

## 4. API 명세
### 4.1 인증 API
### 4.2 보드 API
### 4.3 Task API
### 4.4 (추가 API)

## 5. Service 핵심 로직

## 6. 데이터베이스 마이그레이션

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

#### frontend.md
```markdown
# BRIDGE - Frontend 기술 문서 vX.X

## 1. 핵심 변경사항 (vX.X)

## 2. TypeScript 타입 정의

## 3. API 클라이언트
### 3.1 api.ts 함수
### 3.2 services.ts 함수

## 4. Context
### 4.1 AuthContext
### 4.2 ThemeContext
### 4.3 (추가 Context)

## 5. 핵심 컴포넌트
### 5.1 페이지 컴포넌트
### 5.2 공통 컴포넌트
### 5.3 모달 컴포넌트

## 6. 주요 계산 로직

## 변경 이력
---
**문서 버전**: X.X | **최종 수정**: YYYY년 MM월 DD일
```

---

## 문서 저장

### 새 버전 폴더 생성
```bash
mkdir -p docs/versions/design/vX.X/
mkdir -p docs/versions/tech/vX.X/
```

### 파일 저장 위치
- Design 문서: `docs/versions/design/vX.X/{overview,features,ia,design-system}.md`
- Tech 문서: `docs/versions/tech/vX.X/{architecture,backend,frontend}.md`

---

## 주의사항

1. **코드 사실 기반 작성**: 추측 없이 코드에서 확인된 내용만 작성
2. **이전 버전 내용 유지**: 변경되지 않은 섹션은 그대로 유지
3. **변경 표시**: 새 버전에서 변경된 부분에 `← vX.X 추가/변경/제거` 주석
4. **변경 이력 업데이트**: 각 파일의 변경 이력 테이블에 새 버전 추가
5. **코드 예시 정확성**: 실제 코드에서 복사한 시그니처/구조 사용 (추측 금지)
6. **다이어그램 업데이트**: 구조 변경 시 ASCII 다이어그램 수정
7. **문서 간 참조**: 관련 문서 링크 추가 (예: `[Backend 문서](../tech/vX.X/backend.md)`)
8. **문서 간 일관성**: 앞서 작성한 문서 내용과 모순되지 않도록 주의

---

## 출력 형식

작업 완료 후 다음을 보고:
1. 생성된 문서 폴더 경로
2. 생성된 파일 목록 (7개) + 각 파일 크기
3. 주요 변경 사항 요약 (5~10개 bullet point)
4. 각 문서별 변경 이력에 추가된 내용
5. 이전 버전 대비 추가/수정/제거된 섹션 수
