# BRIDGE 코드베이스 종합 분석 리포트

**Task ID**: TASK-2026-0214-001
**날짜**: 2026-02-14
**분류**: 상급 (전체 코드베이스 분석)
**목적**: 코드 품질, 일관성, 유지보수성 점검 및 리팩토링 로드맵 수립

---

## 분석 개요

AI로 작성된 코드의 일관성과 유지보수성을 점검하기 위해 전체 코드베이스를 6개 영역으로 나누어 병렬 분석을 수행했습니다.

| # | 분석 영역 | 대상 |
|---|----------|------|
| 1 | BE 도메인 레이어 | 31개 도메인 패키지 구조, 네이밍, 서비스 패턴 |
| 2 | BE 글로벌/설정 레이어 | 보안, 예외처리, 설정, 필터, 인터셉터 |
| 3 | BE 리포지토리/쿼리 패턴 | 엔티티 설계, N+1, 트랜잭션, 페이지네이션 |
| 4 | FE 컴포넌트 품질 | 컴포넌트 구조, 상태관리, 타입 안전성 |
| 5 | FE 유틸/서비스 레이어 | API 클라이언트, 서비스, 타입, i18n |
| 6 | FE 페이지 아키텍처 | 페이지 분해, 모달, 데이터 페칭, 성능 |

---

## 전체 스코어카드

| 영역 | 점수 | 핵심 상태 |
|------|------|----------|
| BE 패키지 구조 & 네이밍 | 9.5/10 | 31개 도메인 전체 일관성 우수 |
| BE 엔티티 & JPA 설계 | 9/10 | 전체 LAZY, JOIN FETCH 잘 적용 |
| BE 트랜잭션 관리 | 9/10 | readOnly 기본값, 메서드별 오버라이드 |
| BE 보안 & 설정 | 6/10 | 테스트 키 fallback, Jackson 취약점 |
| FE 타입 안전성 & API 규약 | 8/10 | snake_case 일관, 일부 중복 타입 |
| FE 컴포넌트 구조 | 5/10 | God 컴포넌트 다수, prop drilling 심각 |
| FE 상태 관리 | 5/10 | useState 40+개, React Query 미사용 |
| FE 유틸 & 서비스 | 7/10 | 잘 조직되었으나 반복 패턴 다수 |

---

## 강점 (잘 되어 있는 부분)

### Backend
- **패키지 구조 100% 일관**: 31개 도메인 모두 Controller -> Service -> Repository -> DTO 레이어 준수
- **네이밍 100% 통일**: XxxController, XxxService, XxxRepository, XxxRequest, XxxResponse
- **전체 LAZY 로딩**: EAGER 0건, JOIN FETCH로 N+1 체계적 방어
- **트랜잭션 관리**: 클래스 `readOnly=true` 기본, 뮤테이션 메서드만 `@Transactional` 오버라이드
- **DTO 완전 분리**: 엔티티 직접 노출 0건, static inner class 패턴 통일
- **검증 일관**: @NotBlank/@Size 모든 Request DTO에 적용
- **UTC 준수**: BaseTimeEntity + `LocalDateTime.now(ZoneOffset.UTC)` 100%

### Frontend
- **snake_case API 규약**: 타입 인터페이스 전체 준수
- **dateUtils**: 10개 언어 로케일 완벽 지원, UTC 정규화
- **assigneeColor**: 단일 소스 중앙 관리, 해시 기반 결정적 색상
- **WebSocket 동기화**: 불변 상태 업데이트, 중복 방지 로직

---

## 발견된 문제 (우선순위별)

### P0: 즉시 조치 (보안) -> Phase 1에서 처리 완료

상세 내용은 [Phase 1 보안 조치 리포트](TASK-2026-0214-002-security-fixes.md) 참고.

| # | 항목 | 상태 |
|---|------|------|
| P0-1 | application-local.yml API 키 | 이미 .gitignore 적용, Git 미추적 확인 |
| P0-2 | CacheConfig Jackson 역직렬화 취약점 | 패치 완료 |
| P0-3 | Toss 결제 테스트 키 fallback | 제거 완료 |

### P1: 높은 우선순위 (유지보수성 직접 영향)

#### P1-4. KanbanBoardPage God Component (3,050줄)
- **파일**: `frontend/src/app/pages/KanbanBoardPage.tsx`
- **문제**: useState 40+개, 15개 모달 관리, 5개 뷰모드 통합
- **영향**: 모든 변경이 이 파일을 거침, 충돌/버그 위험 최대
- **방안**: KanbanView, ScheduleContainer, MeetingView, NotesView, StatisticsContainer 분리 + useReducer 또는 BoardDataContext로 상태 통합

#### P1-5. 대형 컴포넌트 분해

| 컴포넌트 | 줄 수 | 분해 방안 |
|----------|-------|----------|
| StatisticsView | 2,273 | OverviewChart, TimelineChart, DetailedMetrics |
| TaskDetailModal | 1,832 | TaskFormSection, ChecklistSection, CommentsPanel |
| ManagementView | 1,787 | MilestoneAnalysis, MemberProductivity, DelayedItems |
| AddDailyChecklistModal | 1,325 | GroupingPanel, PendingItemsList |
| CommentPanel | 1,234 | CommentList, CommentEditor, ReactionBar |

#### P1-6. BoardService 과부하 (444줄, 28개 의존성)
- **파일**: `backend/.../board/service/BoardService.java`
- **문제**: `deleteBoard()`와 `deleteBoardByAdmin()`이 85% 중복 (총 109줄)
- **방안**: BoardDeletionService 분리, `deleteAllBoardRelatedData()` 헬퍼 추출

#### P1-7. Prop Drilling (85회 발생)
- **문제**: `memberColorMap`, `boardMembers`, `currentUser`가 3~4단계 전달
- **방안**: BoardDataContext 생성

### P2: 중간 우선순위 (일관성 & 패턴)

| # | 항목 | 파일 | 내용 |
|---|------|------|------|
| P2-8 | services.ts 반복 패턴 | `utils/services.ts` | 74개 동일 try-catch 블록 -> 공통 래퍼 함수 |
| P2-9 | 모달 불일관 | 20+ 모달 파일 | shadcn Dialog / createPortal / 수동 렌더링 3가지 혼재 -> 통일 |
| P2-10 | catch(err: any) | 15+ 컴포넌트 | err: unknown + error handler 유틸 |
| P2-11 | 중복 타입 | types/index.ts, api.ts | BoardTier, ApiError 양쪽 존재 -> 단일 소스 |
| P2-12 | BE 보안 설정 | SecurityConfig.java | CORS 헤더 제한, H2 프로파일 가드, 필터 순서 |
| P2-13 | getMyBoards N+1 | BoardService.java:137-169 | 보드별 개별 쿼리 -> 배치 쿼리로 전환 |

### P3: 낮은 우선순위 (점진적 개선)

| # | 항목 | 내용 |
|---|------|------|
| P3-14 | useCallback 누락 | KanbanBoardPage 이벤트 핸들러 미메모이제이션 |
| P3-15 | React Query 도입 | 수동 useEffect+useState -> 캐싱/자동 refetch |
| P3-16 | 커스텀 훅 추출 | useAsyncData, useForm 패턴 반복 10+곳 |
| P3-17 | zh-TW.json 번역 누락 | 다른 언어 대비 136개 키 부족 |
| P3-18 | 매직 넘버 상수화 | api.ts 토큰 갱신 임계값, services.ts 좌석 가격 |
| P3-19 | BE 부가 개선 | ChecklistItem updatedAt, MDC 상관관계 ID, @BatchSize |

---

## 리팩토링 로드맵

```
Phase 1 (즉시)     보안 조치                     -> 완료
Phase 2 (1~2주)    핵심 구조 리팩토링             P1-4, P1-6, P1-7
Phase 3 (2~3주)    컴포넌트 분해                  P1-5, P2-9
Phase 4 (3~4주)    패턴 통일                      P2-8, P2-10~13
Phase 5 (지속)     점진적 개선                    P3-14~19
```

---

## 분석 방법론

- 6개 분석 에이전트 병렬 실행 (총 248개 도구 호출)
- Backend: 246개 Java 파일 중 주요 파일 50+ 직접 읽기
- Frontend: 190개 TSX 파일 중 주요 파일 50+ 직접 읽기
- 각 에이전트가 15~20개 파일을 라인 레벨로 검토
