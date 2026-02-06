# 버전 문서 업데이트

## 목표
이전 버전 대비 변경 사항을 파악하여 Design 문서와 Tech 문서의 다음 버전을 생성합니다.

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

## 실행 단계

### 1. 현재 버전 파악
1. `/docs/versions/design/` 디렉토리에서 최신 버전 폴더 확인
2. `/docs/versions/tech/` 디렉토리에서 최신 버전 폴더 확인
3. 다음 버전 번호 결정 (예: v8.0 → v9.0)

### 2. 변경 사항 분석 (병렬 실행)
다음을 병렬로 분석:

**Frontend 변경사항**:
- `frontend/src/app/components/` - 새로운/수정된 컴포넌트
- `frontend/src/app/types/index.ts` - 타입 변경
- `frontend/src/app/utils/api.ts` - API 변경
- `frontend/src/app/utils/services.ts` - 서비스 로직 변경
- `frontend/src/app/pages/` - 페이지 변경
- `frontend/src/app/contexts/` - Context 변경

**Backend 변경사항** (별도 저장소: `/Users/yoo/Documents/GitHub/KanbanProject/backend/`):
- `backend/src/main/java/com/kanban/domain/` - 도메인 변경
- 새로운 엔티티, Repository, Service, Controller 확인

### 3. 이전 버전 문서 읽기
- 최신 Design 문서 전체 읽기 (4개 파일 모두)
- 최신 Tech 문서 전체 읽기 (3개 파일 모두)

### 4. 변경사항 정리
다음 카테고리로 분류:
- **신규 기능**: 새로 추가된 기능
- **변경 사항**: 기존 기능의 수정
- **제거 사항**: 삭제된 기능
- **버그 수정**: 수정된 버그
- **UI/UX 개선**: 디자인 변경

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
mkdir -p /docs/versions/design/vX.X/
mkdir -p /docs/versions/tech/vX.X/
```

### 파일 저장 위치
- Design 문서: `/docs/versions/design/vX.X/{overview,features,ia,design-system}.md`
- Tech 문서: `/docs/versions/tech/vX.X/{architecture,backend,frontend}.md`

---

## 주의사항

1. **이전 버전 내용 유지**: 변경되지 않은 섹션은 그대로 복사
2. **변경 표시**: 새 버전에서 변경된 부분에 `← vX.X 추가` 주석 추가
3. **변경 이력 업데이트**: 각 파일의 변경 이력 테이블에 새 버전 추가
4. **코드 예시 업데이트**: 실제 코드와 일치하도록 업데이트
5. **다이어그램 업데이트**: 구조 변경 시 ASCII 다이어그램 수정
6. **문서 간 참조**: 관련 문서 링크 추가 (예: `[Backend 문서](./backend.md)`)

---

## 출력 형식

작업 완료 후 다음을 보고:
1. 생성된 문서 폴더 경로
2. 생성된 파일 목록 (7개)
3. 주요 변경 사항 요약 (5~10개 bullet point)
4. 각 문서별 변경 이력에 추가된 내용
