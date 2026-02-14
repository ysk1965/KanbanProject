# Phase 2 핵심 구조 리팩토링 실행 계획

**Task ID**: TASK-2026-0214-003
**날짜**: 2026-02-14
**분류**: P1 높은 우선순위 (유지보수성 직접 영향)
**상위 태스크**: [TASK-2026-0214-001 코드베이스 종합 분석](TASK-2026-0214-001-codebase-audit.md)

---

## 개요

Phase 2는 유지보수성에 가장 큰 영향을 미치는 **3가지 구조적 문제**를 해결합니다.

| # | 작업 | 핵심 수치 | 예상 효과 |
|---|------|----------|----------|
| P1-4 | KanbanBoardPage 분해 | 3,050줄 → 5~7개 모듈 | 변경 충돌 감소, 단위 테스트 가능 |
| P1-6 | BoardService 분할 | 444줄, 30개 의존성 → 3개 서비스 | 책임 분리, 중복 55줄 제거 |
| P1-7 | BoardDataContext 도입 | prop drilling 9개 제거 | KanbanBlock props 24→10개 |

---

## P1-4: KanbanBoardPage 분해

### 무엇이 문제인가

`KanbanBoardPage.tsx`(3,050줄)가 앱의 거의 모든 상태와 로직을 한 파일에서 관리하고 있습니다.

**현재 규모:**
- useState: **48개**
- useEffect: **11개**
- 이벤트 핸들러: **67개**
- 모달: **14개**
- 뷰 모드: **7개** (kanban, weekly, schedule, meeting, notes, statistics, ai_report)
- 자식 컴포넌트에 전달되는 최대 props: **26개** (KanbanBlock)

### 왜 문제인가

1. **변경 충돌**: 모든 기능 수정이 이 파일을 거침 → 다중 작업 시 Git 충돌 빈번
2. **인지 부하**: 3,050줄에서 특정 로직 찾기 어려움
3. **테스트 불가**: 전체 페이지를 마운트해야 개별 뷰 테스트 가능
4. **리렌더 비효율**: 하나의 상태 변경이 전체 페이지 리렌더 유발

### 분해 전략

#### Step 1: 커스텀 훅 추출 (상태 로직 분리)

현재 48개 useState를 **5개 커스텀 훅**으로 그룹화합니다.

**`useBoardData(boardId)`** — 보드 핵심 데이터
```
관리 상태: board, blocks, features, allFeatures, tasks, tags, milestones,
           checklistDataMap, scheduledTaskIds, isLoading
관리 함수: loadBoardData, reloadFeaturesAndTasks
useEffect: 메인 데이터 로드 (현재 lines 233-345)
```

**`useBoardModals()`** — 14개 모달 상태 통합
```
관리 상태: isFeatureModalOpen, isTaskModalOpen, isAddBlockModalOpen,
           isAddFeatureModalOpen, isShareBoardModalOpen, isSubscriptionModalOpen,
           isInquiryModalOpen, isMilestoneModalOpen, isMilestoneOnboardingOpen,
           isUpgradeModalOpen, isPremiumBenefitsModalOpen, seatPurchaseModal,
           showCreditModal, alertModal, selectedFeature, selectedTask,
           selectedMilestone, upgradeTrigger, creditModalMode
관리 함수: open/close 각 모달
```

**`useBoardMembers(boardId)`** — 멤버 & 색상
```
관리 상태: boardMembersData, memberColorMap (useMemo)
관리 함수: handleAddMember, handleUpdateMemberRole, handleUpdateMemberColor,
           handleRemoveMember, handleReorderMembers
useEffect: 멤버 목록 새로고침 (현재 lines 391-411)
```

**`useBoardFilters()`** — 필터 & UI 상태
```
관리 상태: filterOptions, selectedFeatureIds, expandedChecklistTaskIds,
           expandedFeatureIds, kanbanSelectedMilestoneId, showFeatureLabel,
           viewMode
관리 함수: handleViewModeChange, handleToggleFeatureChip,
           handleToggleChecklistExpand, handleKanbanMilestoneSelect
useMemo: filteredFeatures, filteredTasks (현재 lines 1831-1895)
```

**`useBoardSubscription(boardId)`** — 구독 & 결제
```
관리 상태: subscription, tierInfo, boardLimits, aiCredits
관리 함수: handleSeatUpgrade, handleChangeBillingCycle,
           handleSubscriptionPurchaseSeats, handleCancelSubscription,
           handleCreditPurchaseComplete, openUpgradeModal
useEffect: AI 크레딧 로드, 크레딧 소진 리스너
```

#### Step 2: 뷰 컨테이너 분리 (JSX 분해)

현재 7개 뷰모드의 JSX를 별도 컴포넌트로 추출합니다.

| 뷰 | 현재 위치 | 새 파일 | 내용 |
|----|----------|---------|------|
| kanban | lines 2277-2683 | `KanbanView.tsx` | 블록 루프, 빈 가이드, 필터 툴바 |
| weekly | lines 2232-2276 | (기존 WeeklyScheduleView 유지) | 변경 없음 |
| schedule | lines 2684-2702 | (기존 DailyScheduleView 유지) | 변경 없음 |
| meeting | lines 2703-2712 | (기존 MeetingCalendarView 유지) | 변경 없음 |
| notes | lines 2713-2722 | (기존 NotesView 유지) | 변경 없음 |
| statistics | lines 2723-2748 | (기존 StatisticsView 유지) | 변경 없음 |
| ai_report | lines 2749-2770 | (기존 AIReportPanel 유지) | 변경 없음 |

실질적으로 **kanban 뷰 JSX(~400줄)**만 추출하면 됩니다.
나머지 뷰는 이미 별도 컴포넌트이고, KanbanBoardPage는 라우팅만 합니다.

#### Step 3: 헤더 & 모달 영역 분리

| 영역 | 현재 위치 | 새 파일 | 줄 수 |
|------|----------|---------|------|
| 보드 헤더 | lines 1918-2172 | `BoardHeader.tsx` | ~250줄 |
| 뷰모드 탭 바 | lines 2175-2228 | `ViewModeTabs.tsx` | ~55줄 |
| 모달 렌더 영역 | lines 2867-3046 | `BoardModals.tsx` | ~180줄 |

#### 분해 후 KanbanBoardPage 예상 구조

```tsx
function KanbanBoardPage() {
  const { boardId } = useParams();
  const boardData = useBoardData(boardId);
  const modals = useBoardModals();
  const members = useBoardMembers(boardId);
  const filters = useBoardFilters();
  const subscription = useBoardSubscription(boardId);

  // WebSocket (기존 유지)
  const { connectionStatus, onlineUsers } = useBoardWebSocket({ ... });

  // CRUD 핸들러 (features, tasks, blocks, tags, milestones)
  // → 이 부분은 추가 훅으로 분리 가능하지만 Phase 3에서 진행

  return (
    <BoardDataProvider value={{ ...boardData, ...members, ...filters }}>
      <BoardHeader ... />
      <ViewModeTabs ... />

      {viewMode === 'kanban' && <KanbanView ... />}
      {viewMode === 'weekly' && <WeeklyScheduleView ... />}
      {viewMode === 'schedule' && <DailyScheduleView ... />}
      {viewMode === 'meeting' && <MeetingCalendarView ... />}
      {viewMode === 'notes' && <NotesView ... />}
      {viewMode === 'statistics' && <StatisticsView ... />}
      {viewMode === 'ai_report' && <AIReportPanel ... />}

      <BoardModals ... />
    </BoardDataProvider>
  );
}
```

**예상 결과**: KanbanBoardPage 3,050줄 → ~800줄 (핵심 오케스트레이션만)

### 실행 순서 & 리스크

| 순서 | 작업 | 리스크 | 검증 방법 |
|------|------|--------|----------|
| 1 | `useBoardModals` 추출 | 낮음 (순수 UI 상태) | 모달 열기/닫기 테스트 |
| 2 | `useBoardFilters` 추출 | 낮음 (순수 상태) | 필터 동작 테스트 |
| 3 | `useBoardSubscription` 추출 | 낮음 (독립적) | 결제 플로우 테스트 |
| 4 | `useBoardMembers` 추출 | 중간 (ShareBoardModal 연동) | 멤버 추가/삭제/색상 테스트 |
| 5 | `useBoardData` 추출 | 높음 (핵심 데이터) | 전체 보드 로딩 + WebSocket 테스트 |
| 6 | JSX 분해 (KanbanView 등) | 중간 (props 연결) | 각 뷰모드 렌더링 테스트 |

---

## P1-6: BoardService 분할

### 무엇이 문제인가

`BoardService.java`(444줄)에 **30개 리포지토리 의존성**이 집중되어 있고, `deleteBoard()`와 `deleteBoardByAdmin()`이 **95% 동일한 코드를 중복**하고 있습니다.

**현재 메서드 구성 (15개):**

| 메서드 | 줄 수 | 역할 |
|--------|------|------|
| createBoard | 37 | 보드 생성 + 기본 블록 + 구독 |
| getMyBoards | 33 | 내 보드 목록 조회 |
| getBoard | 13 | 보드 상세 조회 |
| updateBoard | 21 | 보드 이름/설명 수정 |
| **deleteBoard** | **64** | 보드 삭제 (소유자 검증 + 26개 리포지토리 호출) |
| **deleteBoardByAdmin** | **45** | 관리자 보드 삭제 (검증 없이 동일 삭제) |
| updateSelectedMilestone | 17 | 마일스톤 선택 |
| toggleStar | 31 | 즐겨찾기 토글 |
| getMembershipOrThrow | 4 | 멤버십 조회 |
| checkViewerOrAbove | 7 | 뷰어 이상 권한 확인 |
| checkMemberOrAbove | 6 | 멤버 이상 권한 확인 |
| checkAdminOrAbove | 6 | 관리자 이상 권한 확인 |
| checkOwner | 6 | 소유자 권한 확인 |
| getBoardTier | 14 | 보드 티어 정보 |
| getBoardLimits | 11 | 보드 제한사항 |

### 중복 분석

`deleteBoard()`(lines 209-272)과 `deleteBoardByAdmin()`(lines 278-322)의 차이:

```
deleteBoard():
  1. board = boardRepository.findById(boardId)  ← 동일
  2. if (!board.isOwner(userId)) throw          ← 유일한 차이 (권한 검증)
  3. [26개 리포지토리 삭제 순서]                  ← 동일
  4. log.info("Board deleted by owner")          ← 메시지만 다름

deleteBoardByAdmin():
  1. board = boardRepository.findById(boardId)  ← 동일
  2. (권한 검증 없음)                             ← 유일한 차이
  3. [26개 리포지토리 삭제 순서]                  ← 동일
  4. log.info("Board deleted by admin")          ← 메시지만 다름
```

**중복 코드: ~55줄 (95%)**

### 분할 계획

#### A. BoardDeletionService (신규)

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardDeletionService {

    // deleteBoard/deleteBoardByAdmin에서 사용하는 19개 리포지토리만 이동
    private final BoardRepository boardRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final FeatureTagRepository featureTagRepository;
    private final TaskTagRepository taskTagRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentRepository commentRepository;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final NotificationRepository notificationRepository;
    private final ActivityLogRepository activityLogRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final ReportRepository reportRepository;
    private final TaskRepository taskRepository;
    private final FeatureRepository featureRepository;
    private final BlockRepository blockRepository;
    private final TagRepository tagRepository;
    private final WeightLevelRepository weightLevelRepository;
    private final MilestoneRepository milestoneRepository;
    private final DailyStandupConfigRepository dailyStandupConfigRepository;
    private final MemberSlackWebhookRepository memberSlackWebhookRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final UserBoardStarRepository userBoardStarRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final FileUploadService fileUploadService;

    @Transactional
    public void deleteBoard(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_NOT_OWNER);
        }
        deleteAllBoardData(board);
        log.info("Board deleted by owner: {}", boardId);
    }

    @Transactional
    public void deleteBoardByAdmin(String boardId) {
        Board board = boardRepository.findById(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        deleteAllBoardData(board);
        log.info("Board deleted by admin: {}", boardId);
    }

    private void deleteAllBoardData(Board board) {
        String boardId = board.getId();

        // FK 의존 순서: leaf → parent
        milestoneAllocationRepository.deleteAllByBoardId(boardId);
        milestoneFeatureRepository.deleteAllByBoardId(boardId);
        featureTagRepository.deleteAllByBoardId(boardId);
        taskTagRepository.deleteAllByBoardId(boardId);
        taskWeightRepository.deleteAllByBoardId(boardId);
        dailyChecklistRepository.deleteByBoardId(boardId);
        scheduleBlockRepository.deleteByBoardId(boardId);
        checklistItemRepository.deleteAllByBoardId(boardId);

        // S3 파일 정리
        List<CommentAttachment> attachments = commentAttachmentRepository.findByBoardId(boardId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByBoardId(boardId);
        commentRepository.deleteByBoardId(boardId);

        notificationPreferenceRepository.deleteByBoardId(boardId);
        notificationRepository.deleteByBoardId(boardId);
        activityLogRepository.deleteByBoardId(boardId);
        inviteLinkRepository.deleteByBoardId(boardId);
        reportRepository.deleteByBoardId(boardId);

        taskRepository.deleteByBoardId(boardId);
        featureRepository.deleteByBoardId(boardId);
        blockRepository.deleteByBoardId(boardId);

        tagRepository.deleteByBoardId(boardId);
        weightLevelRepository.deleteByBoardId(boardId);
        milestoneRepository.deleteByBoardId(boardId);

        dailyStandupConfigRepository.deleteByBoardId(boardId);
        memberSlackWebhookRepository.deleteByBoardId(boardId);

        paymentHistoryRepository.deleteByBoardId(boardId);
        userBoardStarRepository.deleteByBoardId(boardId);
        boardMemberRepository.deleteByBoardId(boardId);
        subscriptionRepository.deleteByBoardId(boardId);

        boardRepository.delete(board);
    }
}
```

#### B. BoardAuthorizationService (신규)

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardAuthorizationService {

    private final BoardMemberRepository boardMemberRepository;

    public BoardMember getMembershipOrThrow(String boardId, String userId) { ... }
    public void checkViewerOrAbove(String boardId, String userId) { ... }
    public void checkMemberOrAbove(String boardId, String userId) { ... }
    public void checkAdminOrAbove(String boardId, String userId) { ... }
    public void checkOwner(String boardId, String userId) { ... }
}
```

**13개 서비스**가 현재 `boardService.checkXxxOrAbove()`를 호출하므로, 이 변경은 해당 서비스들의 import 수정이 필요합니다:
- FeatureService, TaskService, BlockService, CommentService, ChecklistService
- MemberService, SubscriptionService, TagService, MilestoneService
- InviteService, SlackWebhookService, ActivityService, BoardFacadeService

#### C. BoardService (리팩토링 후)

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardService {

    // 핵심 CRUD에 필요한 의존성만 유지 (~10개)
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserBoardStarRepository userBoardStarRepository;
    private final BlockRepository blockRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final MilestoneRepository milestoneRepository;

    // 메서드: createBoard, getMyBoards, getBoard, updateBoard,
    //        updateSelectedMilestone, toggleStar, getBoardTier, getBoardLimits
}
```

### 효과

| 지표 | 변경 전 | 변경 후 |
|------|---------|---------|
| BoardService 의존성 | 30개 | ~10개 |
| BoardService 줄 수 | 444줄 | ~250줄 |
| 삭제 로직 중복 | 55줄 | 0줄 |
| 권한 확인 위치 | BoardService에 혼합 | BoardAuthorizationService 독립 |
| 변경 영향 범위 | 13개 서비스 import 수정 | 1회성 작업 |

### 실행 순서

| 순서 | 작업 | 리스크 | 검증 |
|------|------|--------|------|
| 1 | BoardAuthorizationService 생성 | 낮음 (순수 추출) | 빌드 + 기존 테스트 |
| 2 | 13개 서비스 import 변경 | 낮음 (기계적 변경) | 빌드 |
| 3 | BoardDeletionService 생성 | 중간 (트랜잭션 경계) | 보드 삭제 테스트 |
| 4 | BoardService에서 삭제/권한 메서드 제거 | 낮음 | 빌드 + 전체 테스트 |
| 5 | AdminService import 변경 | 낮음 | 관리자 삭제 테스트 |

---

## P1-7: BoardDataContext 도입

### 무엇이 문제인가

KanbanBlock이 **24개 props**를 받지만, 그 중 **9개는 자신이 사용하지 않고 DraggableCard에 그대로 전달**합니다.

**KanbanBlock이 사용하지 않고 통과시키는 props:**

| prop | KanbanBlock 사용 | DraggableCard 사용 |
|------|:---:|:---:|
| features | X | O (라벨 표시) |
| availableTags | X | O (태그 렌더링) |
| boardId | X | O (API 호출) |
| checklistDataMap | X | O (체크리스트 표시) |
| memberColorMap | X | O (담당자 색상) |
| showFeatureLabel | X | O (라벨 토글) |
| scheduledTaskIds | X | O (일정 아이콘) |
| expandedChecklistTaskIds | X | O (펼침 상태) |
| onToggleChecklistExpand | X | O (클릭 핸들러) |

### Context 설계

```typescript
// contexts/BoardDataContext.tsx

interface BoardDataContextType {
  // 식별자
  boardId: string;

  // 멤버 & 색상
  boardMembers: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;

  // 보드 구조 데이터
  features: Feature[];
  tags: Tag[];

  // 배치 로드 데이터
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  scheduledTaskIds: Set<string>;

  // UI 상태
  expandedChecklistTaskIds: Set<string>;
  onToggleChecklistExpand: (taskId: string) => void;
  showFeatureLabel: boolean;
}
```

### 영향 받는 파일

| 파일 | 변경 내용 | 영향도 |
|------|----------|--------|
| `contexts/BoardDataContext.tsx` | **신규 생성** | - |
| `pages/KanbanBoardPage.tsx` | Provider 래핑, 9개 prop 전달 제거 | 중간 |
| `components/KanbanBlock.tsx` | props 24→15개, useContext 추가 | 중간 |
| `components/DraggableCard.tsx` | props 13→6개, useContext 추가 | 낮음 |
| `components/TaskDetailModal.tsx` | boardMembers를 context에서 가져오기 | 낮음 |
| `components/CommentPanel.tsx` | boardMembers를 context에서 가져오기 | 낮음 |
| `components/DailyScheduleView.tsx` | boardMembers, memberColorMap context | 낮음 |
| `components/MeetingCalendarView.tsx` | boardMembers context | 낮음 |

### 효과

| 지표 | 변경 전 | 변경 후 |
|------|---------|---------|
| KanbanBlock props | 24개 | ~15개 (-37%) |
| DraggableCard props | 13개 | ~6개 (-54%) |
| 통과 전용 props (KanbanBlock) | 9개 | 0개 |
| boardMembers prop 전달 횟수 | 4곳 | 0곳 (context) |
| memberColorMap prop 전달 횟수 | 3곳 | 0곳 (context) |

### 실행 순서

| 순서 | 작업 | 리스크 | 검증 |
|------|------|--------|------|
| 1 | BoardDataContext 생성 | 낮음 | 타입 체크 |
| 2 | KanbanBoardPage에 Provider 래핑 | 낮음 | 기존 동작 유지 확인 |
| 3 | KanbanBlock/DraggableCard에서 context 사용 | 중간 | 칸반 렌더링 테스트 |
| 4 | 모달 컴포넌트에서 boardMembers context 전환 | 낮음 | 댓글/멤버 표시 테스트 |

---

## 전체 실행 순서 (권장)

Phase 2 작업 간 의존성을 고려한 순서입니다.

```
Week 1:
  Day 1-2: P1-6 BoardService 분할
    ├── BoardAuthorizationService 추출 + 13개 서비스 import 변경
    └── BoardDeletionService 추출 + deleteAllBoardData 통합

  Day 3-4: P1-7 BoardDataContext 도입
    ├── Context 생성 + Provider 래핑
    └── KanbanBlock/DraggableCard/모달 props 제거

Week 2:
  Day 1-3: P1-4 KanbanBoardPage 분해
    ├── useBoardModals 훅 추출
    ├── useBoardFilters 훅 추출
    ├── useBoardSubscription 훅 추출
    ├── useBoardMembers 훅 추출
    └── useBoardData 훅 추출 + KanbanView JSX 분리

  Day 4: 통합 검증
    ├── 전체 뷰모드 렌더링 테스트
    ├── 모달 열기/닫기 테스트
    ├── WebSocket 이벤트 수신 테스트
    └── 보드 생성/삭제 플로우 테스트
```

### 왜 이 순서인가

1. **P1-6 먼저**: 백엔드 변경은 프론트와 독립적이므로 안전하게 먼저 진행
2. **P1-7 다음**: Context 도입이 KanbanBoardPage 분해의 전제조건 (Context 없이 분해하면 props가 더 복잡해짐)
3. **P1-4 마지막**: 가장 큰 변경이지만, Context가 준비된 상태에서 진행하면 훨씬 깔끔

---

## 검증 체크리스트

### 백엔드 (P1-6)
- [ ] `./gradlew build test` 통과
- [ ] 보드 생성 → 데이터 추가 → 삭제 플로우
- [ ] 관리자 보드 삭제 플로우
- [ ] 권한 확인 (뷰어가 수정 시도 → 403)
- [ ] S3 첨부파일 정리 확인

### 프론트엔드 (P1-7 + P1-4)
- [ ] `npm run build` 통과 (타입 에러 없음)
- [ ] 칸반 뷰: 블록/카드 렌더링, 드래그앤드롭
- [ ] 일정 뷰: 일간/주간 전환
- [ ] 미팅 뷰: 캘린더 렌더링
- [ ] 노트 뷰: 문서 목록
- [ ] 통계 뷰: 차트 렌더링
- [ ] 모달: 14개 모달 열기/닫기
- [ ] 필터: 키워드, 멤버, 태그, 피처칩 필터링
- [ ] WebSocket: 실시간 이벤트 수신
- [ ] 담당자 색상: memberColorMap 정상 표시
