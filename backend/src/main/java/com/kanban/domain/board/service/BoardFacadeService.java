package com.kanban.domain.board.service;

import com.kanban.domain.activity.dto.ActivityResponse;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.block.service.BlockService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.UserBoardStarRepository;
import com.kanban.domain.board.dto.BoardResponse;
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
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.domain.tag.dto.TagResponse;
import com.kanban.domain.tag.service.TagService;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

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
    private final TaskRepository taskRepository;

    private final BoardService boardService;
    private final BlockService blockService;
    private final FeatureService featureService;
    private final TaskService taskService;
    private final TagService tagService;
    private final MemberService memberService;
    private final ActivityService activityService;
    private final MilestoneService milestoneService;

    private static final int DEFAULT_ACTIVITY_LIMIT = 20;

    /**
     * 보드 진입 시 필요한 모든 데이터를 한 번에 조회
     */
    @Transactional
    public BoardResponse.Full getBoardFull(String boardId, String userId) {
        // 1. 권한 확인 (한 번만)
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        // 2. 기본 보드 정보
        boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        // 3. 각 서비스에서 데이터 조회 (권한 검사 중복되지만 캐싱 활용 가능)
        BlockResponse.ListResponse blocksResponse = blockService.getBlocks(boardId, userId);
        FeatureResponse.ListResponse featuresResponse = featureService.getFeatures(boardId, userId, null);
        TaskResponse.ListResponse tasksResponse = taskService.getTasks(boardId, userId, null, null, null);
        TagResponse.ListResponse tagsResponse = tagService.getTags(boardId, userId);
        MemberResponse.ListResponse membersResponse = memberService.getMembers(boardId, userId);
        ActivityResponse.ListResponse activitiesResponse = activityService.getActivities(boardId, userId, null, DEFAULT_ACTIVITY_LIMIT);
        MilestoneResponse.ListResponse milestonesResponse = milestoneService.getMilestones(boardId, userId);

        // 4. 초대 링크 (Admin+ 권한만)
        List<InviteResponse.Detail> inviteLinks;
        if (membership.isAdminOrAbove()) {
            List<InviteLink> links = inviteLinkRepository.findByBoardIdAndIsActiveTrue(boardId);
            inviteLinks = links.stream().map(InviteResponse.Detail::of).toList();
        } else {
            inviteLinks = List.of();
        }

        // 5. 구독 상세 (billable 멤버 수 동기화)
        if (subscription != null) {
            subscription.updateBillableMemberCount(memberCount);
        }
        SubscriptionResponse.Detail subscriptionDetail = subscription != null
                ? SubscriptionResponse.Detail.of(subscription) : null;

        // 6. Tier & Limits
        if (board.checkAndUpdateTierIfTrialExpired()) {
            log.info("Board tier auto-downgraded to STANDARD: {}", boardId);
        }
        BoardResponse.TierInfo tierInfo = BoardResponse.TierInfo.of(board);
        int currentTaskCount = taskRepository.countByBoardId(boardId);
        BoardResponse.Limits limits = BoardResponse.Limits.of(board, currentTaskCount);

        log.info("Board full data loaded: {} by user: {}", boardId, userId);

        return BoardResponse.Full.builder()
                .id(board.getId())
                .name(board.getName())
                .description(board.getDescription())
                .owner(BoardResponse.OwnerInfo.of(board))
                .myRole(membership.getRole())
                .isStarred(isStarred)
                .memberCount(memberCount)
                .subscription(subscription != null ? BoardResponse.SubscriptionInfo.of(subscription) : null)
                .scheduleSettings(BoardResponse.ScheduleSettings.of(board))
                .selectedMilestoneId(board.getSelectedMilestoneId())
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
                .build();
    }
}
