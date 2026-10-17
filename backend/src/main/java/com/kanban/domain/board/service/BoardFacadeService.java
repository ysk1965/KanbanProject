package com.kanban.domain.board.service;

import com.kanban.domain.activity.dto.ActivityResponse;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.block.service.BlockService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardJoinRequestRepository;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.JoinRequestStatus;
import com.kanban.domain.board.UserBoardStarRepository;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.feature.service.FeatureService;
import com.kanban.domain.invite.InviteLink;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.invite.dto.InviteResponse;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.member.service.MemberService;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.milestone.service.MilestoneService;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.tag.dto.TagResponse;
import com.kanban.domain.tag.service.TagService;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.system.MonetizationService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 보드 관련 여러 서비스를 조합하여 통합 응답을 제공하는 Facade 서비스
 * 보드 진입 시 13개 개별 API 호출을 1개로 통합
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardFacadeService {

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserBoardStarRepository userBoardStarRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final UserRepository userRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final BoardJoinRequestRepository boardJoinRequestRepository;

    private final BoardService boardService;
    private final BlockService blockService;
    private final FeatureService featureService;
    private final TaskService taskService;
    private final TagService tagService;
    private final MemberService memberService;
    private final ActivityService activityService;
    private final MilestoneService milestoneService;
    private final AiCreditService aiCreditService;
    private final MonetizationService monetizationService;

    private static final int DEFAULT_ACTIVITY_LIMIT = 20;

    /**
     * 보드 진입 시 필요한 모든 데이터를 한 번에 조회
     * (클래스 레벨 @Transactional(readOnly = true) 적용 — 순수 읽기 경로.
     *  유일한 쓰기인 Trial 만료 다운그레이드는 BoardService.persistTrialExpiryDowngrade의
     *  REQUIRES_NEW 쓰기 트랜잭션으로 분리되어 있다)
     */
    public BoardResponse.Full getBoardFull(String boardId, String userId) {
        // 1. 권한 확인 (한 번만)
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 멤버십 확인 (없으면 시스템 ADMIN → 조직 멤버 순으로 체크)
        java.util.Optional<BoardMember> membershipOpt = boardMemberRepository.findByBoardIdAndUserId(boardId, userId);
        BoardRole myRole;
        boolean isSystemAdminView = false;
        boolean isOrgMemberViewer = false;

        if (membershipOpt.isPresent()) {
            myRole = membershipOpt.get().getRole();
        } else {
            User user = userRepository.findById(userId).orElse(null);
            if (user != null && user.getSystemRole() == SystemRole.ADMIN) {
                myRole = BoardRole.VIEWER;
                isSystemAdminView = true;
            } else if (board.isOrganizationBoard() &&
                       orgMemberRepository.existsByOrganizationIdAndUserId(
                           board.getOrganization().getId(), userId)) {
                if (Boolean.TRUE.equals(board.getOrganization().getAutoBoardAccessEnabled())) {
                    myRole = BoardRole.MEMBER;
                    isOrgMemberViewer = false;
                } else {
                    myRole = BoardRole.VIEWER;
                    isOrgMemberViewer = true;
                }
            } else {
                throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
            }
        }

        // 2. Trial 만료 체크 (데이터 조회 전 tier 확정)
        //    in-memory 변경(checkAndUpdateTierIfTrialExpired)은 readOnly 트랜잭션이라 flush되지 않으므로
        //    응답에 즉시 반영하는 용도이고, 실제 DB 영속화는 REQUIRES_NEW 쓰기 트랜잭션으로 수행한다.
        //    (tier==TRIAL && trialEndsAt 경과 시에만 호출되는 드문 경로)
        if (board.checkAndUpdateTierIfTrialExpired()) {
            boardService.persistTrialExpiryDowngrade(boardId);
            log.info("Board tier auto-downgraded to STANDARD: {}", boardId);
        }

        // 3. 기본 보드 정보
        boolean isStarred = !isSystemAdminView && !isOrgMemberViewer && userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        // 3. 각 서비스에서 데이터 조회
        //    멤버십은 위(1)에서 이미 검증했으므로 checkViewerOrAbove를 생략하는 internal 변형을 호출한다
        //    (서비스당 1회씩 중복되던 권한 확인 쿼리 7건 제거)
        BlockResponse.ListResponse blocksResponse = blockService.getBlocksInternal(boardId, null);
        FeatureResponse.ListResponse featuresResponse = featureService.getFeaturesInternal(boardId, null);
        TaskResponse.ListResponse tasksResponse = taskService.getTasksInternal(boardId, null, null, null);
        TagResponse.ListResponse tagsResponse = tagService.getTagsInternal(boardId);
        MemberResponse.ListResponse membersResponse = memberService.getMembersInternal(boardId);
        ActivityResponse.ListResponse activitiesResponse = activityService.getActivitiesInternal(boardId, null, DEFAULT_ACTIVITY_LIMIT);
        MilestoneResponse.ListResponse milestonesResponse;
        if (board.canAccessMilestone()) {
            milestonesResponse = milestoneService.getMilestonesInternal(boardId);
        } else {
            milestonesResponse = new MilestoneResponse.ListResponse(List.of());
        }

        // 4. 초대 링크 (실제 보드 Admin+ 멤버만, 시스템 Admin 스텔스 뷰에서는 제외)
        List<InviteResponse.Detail> inviteLinks;
        if (!isSystemAdminView && membershipOpt.isPresent() && membershipOpt.get().isAdminOrAbove()) {
            List<InviteLink> links = inviteLinkRepository.findByBoardIdAndIsActiveTrue(boardId);
            inviteLinks = links.stream().map(InviteResponse.Detail::of).toList();
        } else {
            inviteLinks = List.of();
        }

        // 5. 구독 상세 (billable 멤버 수 동기화)
        //    NOTE: readOnly 트랜잭션이므로 이 변경은 flush되지 않는다(의도된 동작).
        //    응답 DTO 계산을 위한 in-memory 동기화이며, 실제 영속화는 멤버 추가/제거 경로에서 수행된다.
        if (subscription != null) {
            subscription.updateBillableMemberCount(memberCount);
        }
        SubscriptionResponse.Detail subscriptionDetail = subscription != null
                ? SubscriptionResponse.Detail.of(subscription) : null;

        // 6. Tier & Limits
        BoardResponse.TierInfo tierInfo = monetizationService.isMonetizationEnabled()
                ? BoardResponse.TierInfo.of(board)
                : BoardResponse.TierInfo.allFeaturesEnabled(board);
        // taskRepository.countByBoardId(boardId) 대체 — COUNT 쿼리 1건 제거.
        // tasksResponse는 findByBoardIdWithFetch(보드 전체 태스크, 필터 없음) 결과.
        // 주의: feature JOIN FETCH에는 Feature의 @SQLRestriction(deleted_at IS NULL)도 적용되므로,
        // "소프트 삭제된 Feature 밑에 살아있는 Task"가 존재하면 countByBoardId보다 작게 집계된다.
        // 정상 데이터에서는 deleteFeature가 하위 Task를 함께 소프트 삭제하므로 두 값이 일치하지만,
        // 서버측 제한 검증(TaskService.validateTaskLimit)은 여전히 countByBoardId를 사용하므로
        // 불일치 데이터에서는 표시(canCreateTask)와 검증이 어긋날 수 있다.
        int currentTaskCount = tasksResponse.getTasks().size();
        BoardResponse.Limits limits = BoardResponse.Limits.of(board, currentTaskCount);

        // 7. AI Credits (이미 로드된 board/subscription 엔티티 전달 — 재조회 쿼리 생략)
        AiCreditResponse.CreditInfo aiCredits = null;
        try {
            aiCredits = aiCreditService.getCredits(board, subscription);
        } catch (Exception e) {
            log.warn("Failed to load AI credits for board {}: {}", boardId, e.getMessage());
        }

        // Feature 카운터 재계산: DB 캐시 카운터가 실제 태스크 상태와 불일치할 수 있으므로
        // 응답 DTO를 실제 tasks 데이터 기준으로 보정
        Map<String, int[]> taskCountsByFeature = new HashMap<>();
        for (TaskResponse.Simple t : tasksResponse.getTasks()) {
            int[] counts = taskCountsByFeature.computeIfAbsent(t.getFeatureId(), k -> new int[2]);
            counts[0]++;
            if (t.isCompleted()) counts[1]++;
        }
        for (FeatureResponse.Simple f : featuresResponse.getFeatures()) {
            int[] counts = taskCountsByFeature.getOrDefault(f.getId(), new int[]{0, 0});
            if (f.getTotalTasks() != counts[0] || f.getCompletedTasks() != counts[1]) {
                f.recalcCounters(counts[0], counts[1]);
            }
        }

        log.info("Board full data loaded: {} by user: {}", boardId, userId);

        return BoardResponse.Full.builder()
                .id(board.getId())
                .name(board.getName())
                .description(board.getDescription())
                .backgroundGradient(board.getBackgroundGradient())
                .boardType(board.getBoardType())
                .owner(BoardResponse.OwnerInfo.of(board))
                .myRole(myRole)
                .isStarred(isStarred)
                .memberCount(memberCount)
                .subscription(subscription != null ? BoardResponse.SubscriptionInfo.of(subscription) : null)
                .scheduleSettings(BoardResponse.ScheduleSettings.of(board))
                .selectedMilestoneId(board.getSelectedMilestoneId())
                .uiLevel(board.getUiLevel())
                .uiOptions(board.getUiOptions())
                .organizationId(board.getOrganization() != null ? board.getOrganization().getId() : null)
                .organizationName(board.getOrganization() != null ? board.getOrganization().getName() : null)
                .isOrgMemberViewer(isOrgMemberViewer)
                .hasPendingJoinRequest(isOrgMemberViewer && boardJoinRequestRepository
                        .existsByBoardIdAndRequesterIdAndStatus(boardId, userId, JoinRequestStatus.PENDING))
                .createdAt(board.getCreatedAt())
                .updatedAt(board.getUpdatedAt())
                .blocks(blocksResponse.getBlocks())
                .features(featuresResponse.getFeatures())
                .tasks(tasksResponse.getTasks())
                .tags(tagsResponse.getTags())
                .inviteLinks(inviteLinks)
                .subscriptionDetail(subscriptionDetail)
                .activities(activitiesResponse)
                .members(membersResponse)
                .milestones(milestonesResponse)
                .tierInfo(tierInfo)
                .limits(limits)
                .aiCredits(aiCredits)
                .build();
    }
}
