# 🎯 Team Kanban Board

소규모 팀(5~15명)을 위한 Feature-Task 연동 칸반보드 웹 애플리케이션

## 📁 문서 구조

```
docs/
├── README.md                    # 프로젝트 개요 (이 파일)
├── ARCHITECTURE.md              # 시스템 아키텍처
├── DATABASE.md                  # DB 스키마 및 ERD
├── API.md                       # API 엔드포인트 명세
├── FEATURES.md                  # 기능 상세 명세
├── BUSINESS.md                  # 비즈니스 모델 (요금제)
└── TASKS.md                     # 개발 태스크 분배
```

## 🎯 핵심 컨셉

### 블록 구조
- **고정 블록**: `Feature` → `Task` → `Done` (삭제/이름변경 불가)
- **커스텀 블록**: Task와 Done 사이에 무제한 추가 가능

### 카드 플로우
```
Feature 블록에서 카드 생성 (유일한 생성 지점)
       ↓
Feature 카드 → 상세 모달 → 서브태스크 추가
       ↓
Task 블록에 연결된 카드 자동 생성
       ↓
Task 카드를 커스텀 블록들 사이로 드래그 이동
       ↓
Done 블록 이동 시 Feature 진행률 자동 반영
```

## 🔑 핵심 규칙

| 항목 | 규칙 |
|------|------|
| 카드 생성 | Feature 블록에서만 가능 |
| Task 생성 | Feature 카드 내 서브태스크로만 가능 |
| 고정 블록 | Feature(첫째), Task(둘째), Done(마지막) |
| 커스텀 블록 | Task와 Done 사이에만 배치 |
| 완료 반영 | Task→Done 이동 시 Feature 진행률 자동 업데이트 |

## 👥 역할 및 권한

```
Owner > Admin > Member > Viewer
```

| 기능 | Owner | Admin | Member | Viewer |
|------|:-----:|:-----:|:------:|:------:|
| 보드 삭제 | ✅ | ❌ | ❌ | ❌ |
| 멤버 초대 | ✅ | ✅ | ❌ | ❌ |
| 블록 관리 | ✅ | ✅ | ❌ | ❌ |
| 카드 작업 | ✅ | ✅ | ✅ | ❌ |
| 결제 관리 | ✅ | ❌ | ❌ | ❌ |

## 💰 비즈니스 모델

- **무료 체험**: 보드 생성 후 7일
- **과금 기준**: Owner + Admin + Member 수 (Viewer 제외)
- **결제 주기**: 월간 / 연간 (약 17~23% 할인)

| 구성원 | 월 결제 | 연 결제 |
|--------|---------|---------|
| 1~3명 | 무료 | 무료 |
| 4~10명 | ₩29,000 | ₩290,000 |
| 11~25명 | ₩69,000 | ₩660,000 |
| 26~50명 | ₩129,000 | ₩1,190,000 |

## 🛠 기술 스택 (권장)

| 영역 | 기술 |
|------|------|
| Frontend | React, TypeScript, Tailwind CSS |
| 상태관리 | Zustand 또는 Jotai |
| 드래그앤드롭 | dnd-kit |
| Backend | Node.js (Express/Fastify) 또는 Go |
| Database | PostgreSQL |
| 인증 | JWT + Refresh Token |
| 결제 | 토스페이먼츠 또는 아임포트 |
| 배포 | Vercel (FE), AWS/GCP (BE) |

## 🚀 Quick Start

```bash
# 레포 클론
git clone https://github.com/your-org/team-kanban.git

# 백엔드 실행
cd backend && npm install && npm run dev

# 프론트엔드 실행
cd frontend && npm install && npm run dev
```

## 📅 개발 일정

| Phase | 기간 | 목표 |
|-------|------|------|
| 1 | 1주 | 인증, 회원가입, 내 보드 목록 |
| 2 | 2주 | 보드, Feature, Task, 드래그 앤 드롭 |
| 3 | 1주 | 커스텀 블록 |
| 4 | 1주 | 멤버 초대, 권한 시스템 |
| 5 | 1주 | 구독, 결제 |
| 6 | 1주 | QA, 최적화, 배포 |

**총 예상 기간: 7주**