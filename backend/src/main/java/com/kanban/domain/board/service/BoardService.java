package com.kanban.domain.board.service;

import com.kanban.domain.activity.ActivityLogRepository;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.*;
import com.kanban.domain.board.dto.BoardRequest;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentReactionRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
import com.kanban.domain.standup.DailyStandupConfigRepository;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.note.NoteCommentReactionRepository;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.NoteTagMappingRepository;
import com.kanban.domain.note.NoteTagRepository;
import com.kanban.domain.note.NoteVersionRepository;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.milestone.MilestoneAllocationRepository;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.notification.NotificationPreferenceRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.subscription.PaymentHistoryRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.tag.FeatureTagRepository;
import com.kanban.domain.tag.TagRepository;
import com.kanban.domain.tag.TaskTagRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.task.TaskDependencyRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.domain.weight.WeightLevelRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardService {

    private static final int MEMBER_PREVIEW_LIMIT = 10;

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserBoardStarRepository userBoardStarRepository;
    private final BlockRepository blockRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final FeatureRepository featureRepository;
    private final CommentRepository commentRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentReactionRepository commentReactionRepository;
    private final NotificationRepository notificationRepository;
    private final ActivityLogRepository activityLogRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final TagRepository tagRepository;
    private final TaskTagRepository taskTagRepository;
    private final FeatureTagRepository featureTagRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final WeightLevelRepository weightLevelRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final MemberSlackWebhookRepository memberSlackWebhookRepository;
    private final DailyStandupConfigRepository dailyStandupConfigRepository;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final ReportRepository reportRepository;
    private final MeetingRepository meetingRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteCommentRepository noteCommentRepository;
    private final NoteRepository noteRepository;
    private final NoteTagMappingRepository noteTagMappingRepository;
    private final NoteTagRepository noteTagRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final BoardCustomEmojiRepository boardCustomEmojiRepository;
    private final TaskDependencyRepository taskDependencyRepository;
    private final BoardJoinRequestRepository boardJoinRequestRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final FileUploadService fileUploadService;

    @Transactional
    public BoardResponse.Detail createBoard(String userId, BoardRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean skipBilling = user.getSystemRole() == SystemRole.TESTER;

        // 보드 생성 (TESTER는 PREMIUM 티어)
        Board board = Board.builder()
                .name(request.getName())
                .description(request.getDescription())
                .backgroundGradient(request.getBackgroundGradient())
                .owner(user)
                .tier(skipBilling ? BoardTier.PREMIUM : BoardTier.TRIAL)
                .build();
        boardRepository.save(board);

        // Owner로 멤버 추가
        BoardMember ownerMember = BoardMember.builder()
                .board(board)
                .user(user)
                .role(BoardRole.OWNER)
                .build();
        boardMemberRepository.save(ownerMember);

        // 기본 블록 3개 생성 (Feature, Task, Done)
        createDefaultBlocks(board);

        // 구독 생성 (TESTER는 PREMIUM, 일반 사용자/ADMIN은 Trial)
        Subscription subscription = skipBilling
                ? Subscription.createPremium(board)
                : Subscription.createTrial(board);
        subscriptionRepository.save(subscription);

        log.info("Board created: {} by user: {}", board.getId(), userId);

        return BoardResponse.Detail.of(board, BoardRole.OWNER, false, 1, subscription);
    }

    private void createDefaultBlocks(Board board) {
        Block featureBlock = Block.createFixedBlock(board, FixedBlockType.FEATURE, 0);
        Block taskBlock = Block.createFixedBlock(board, FixedBlockType.TASK, 1);
        Block inProgressBlock = Block.createCustomBlock(board, "In Progress", null, 2);
        Block doneBlock = Block.createFixedBlock(board, FixedBlockType.DONE, 999);

        blockRepository.save(featureBlock);
        blockRepository.save(taskBlock);
        blockRepository.save(inProgressBlock);
        blockRepository.save(doneBlock);
    }

    @Transactional
    public Board createPersonalBoard(User user) {
        // 이미 개인 보드가 있는지 확인
        if (boardRepository.existsByOwnerIdAndBoardType(user.getId(), BoardType.PERSONAL)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        Board board = Board.builder()
                .name("Personal Board")
                .owner(user)
                .boardType(BoardType.PERSONAL)
                .tier(BoardTier.PREMIUM)
                .build();
        boardRepository.save(board);

        // Owner로 멤버 추가
        BoardMember ownerMember = BoardMember.builder()
                .board(board)
                .user(user)
                .role(BoardRole.OWNER)
                .build();
        boardMemberRepository.save(ownerMember);

        // 기본 블록 생성
        createDefaultBlocks(board);

        // 구독 생성 (PREMIUM)
        Subscription subscription = Subscription.createPremium(board);
        subscriptionRepository.save(subscription);

        log.info("Personal board created: {} for user: {}", board.getId(), user.getId());

        return board;
    }

    public List<BoardResponse.Simple> getMyBoards(String userId) {
        List<BoardResponse.Simple> result = new ArrayList<>();

        // 내가 멤버인 모든 보드 조회
        List<Board> boards = boardRepository.findByMemberId(userId);

        for (Board board : boards) {
            BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(board.getId(), userId)
                    .orElse(null);
            if (membership == null) continue;

            boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, board.getId());
            int memberCount = boardMemberRepository.countBillableMembers(board.getId());
            Subscription subscription = subscriptionRepository.findByBoardId(board.getId()).orElse(null);

            // 태스크 통계
            int taskCount = taskRepository.countByBoardId(board.getId());
            int completedTasks = taskRepository.countByBoardIdAndIsCompletedTrue(board.getId());

            // 멤버 미리보기 (최대 10명)
            List<BoardMember> previewMembers = boardMemberRepository.findTopMembersByBoardId(
                    board.getId(), MEMBER_PREVIEW_LIMIT);
            List<BoardResponse.MemberPreview> memberPreviews = previewMembers.stream()
                    .map(BoardResponse.MemberPreview::of)
                    .toList();

            result.add(BoardResponse.Simple.of(
                    board, membership.getRole(), isStarred, memberCount,
                    taskCount, completedTasks, memberPreviews, subscription));
        }

        return result;
    }

    public BoardResponse.Detail getBoard(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        return BoardResponse.Detail.of(board, membership.getRole(), isStarred, memberCount, subscription);
    }

    @Transactional
    public BoardResponse.Detail updateBoard(String boardId, String userId, BoardRequest.Update request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        if (!membership.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        board.updateInfo(request.getName(), request.getDescription());
        if (request.getBackgroundGradient() != null) {
            board.updateBackgroundGradient(request.getBackgroundGradient());
        }

        boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        log.info("Board updated: {} by user: {}", boardId, userId);

        return BoardResponse.Detail.of(board, membership.getRole(), isStarred, memberCount, subscription);
    }

    /**
     * 소프트 삭제 (Owner용) - deletedAt 마킹, 7일 후 자동 영구삭제
     */
    @Transactional
    public void deleteBoard(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        if (board.isDeleted()) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_DELETED);
        }

        board.softDelete();
        log.info("Board soft-deleted: {} by user: {}", boardId, userId);
    }

    /**
     * Admin 전용 소프트 삭제
     */
    @Transactional
    public void deleteBoardByAdmin(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (board.isDeleted()) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_DELETED);
        }

        board.softDelete();
        log.info("Board soft-deleted by admin: {}", boardId);
    }

    /**
     * 보드 복구 (Admin 전용) - deletedAt을 null로 되돌림
     */
    @Transactional
    public void restoreBoard(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isDeleted()) {
            throw new BusinessException(ErrorCode.BOARD_NOT_DELETED);
        }

        board.restore();
        log.info("Board restored by admin: {}", boardId);
    }

    /**
     * 영구 삭제 - 관련 데이터 전체 정리 (스케줄러/Admin에서 호출)
     */
    @Transactional
    public void permanentlyDeleteBoard(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 관련 데이터 삭제 (FK 의존성 순서: leaf → parent)
        milestoneAllocationRepository.deleteAllByBoardId(boardId);
        milestoneFeatureRepository.deleteAllByBoardId(boardId);
        featureTagRepository.deleteAllByBoardId(boardId);
        taskTagRepository.deleteAllByBoardId(boardId);
        taskWeightRepository.deleteAllByBoardId(boardId);
        dailyChecklistRepository.deleteByBoardId(boardId);
        scheduleBlockRepository.deleteByBoardId(boardId);
        checklistItemRepository.deleteAllByBoardId(boardId);

        List<CommentAttachment> attachments = commentAttachmentRepository.findByBoardId(boardId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByBoardId(boardId);
        commentReactionRepository.deleteByBoardId(boardId);
        commentRepository.deleteByBoardId(boardId);
        notificationPreferenceRepository.deleteByBoardId(boardId);
        notificationRepository.deleteByBoardId(boardId);
        activityLogRepository.deleteByBoardId(boardId);
        inviteLinkRepository.deleteByBoardId(boardId);
        reportRepository.deleteByBoardId(boardId);

        meetingRepository.deleteByBoardId(boardId);
        noteCommentReactionRepository.deleteByBoardId(boardId);
        noteCommentRepository.deleteByBoardId(boardId);
        noteTagMappingRepository.deleteByBoardId(boardId);
        noteVersionRepository.deleteByBoardId(boardId);
        noteRepository.deleteAllByBoardId(boardId);
        noteTagRepository.deleteAllByBoardId(boardId);

        taskDependencyRepository.deleteByBoardId(boardId);
        taskRepository.deleteByBoardId(boardId);
        featureRepository.deleteByBoardId(boardId);
        blockRepository.deleteByBoardId(boardId);

        tagRepository.deleteByBoardId(boardId);
        weightLevelRepository.deleteByBoardId(boardId);
        milestoneRepository.deleteByBoardId(boardId);
        boardCustomEmojiRepository.deleteByBoardId(boardId);

        dailyStandupConfigRepository.deleteByBoardId(boardId);
        memberSlackWebhookRepository.deleteByBoardId(boardId);
        boardJoinRequestRepository.deleteByBoardId(boardId);

        paymentHistoryRepository.deleteByBoardId(boardId);
        userBoardStarRepository.deleteByBoardId(boardId);
        boardMemberRepository.deleteByBoardId(boardId);
        subscriptionRepository.deleteByBoardId(boardId);

        boardRepository.delete(board);
        log.info("Board permanently deleted: {}", boardId);
    }

    @Transactional
    public BoardResponse.Detail updateSelectedMilestone(String boardId, String userId, String milestoneId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        board.updateSelectedMilestone(milestoneId);

        boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        log.info("Board selected milestone updated: {} to {} by user: {}", boardId, milestoneId, userId);

        return BoardResponse.Detail.of(board, membership.getRole(), isStarred, memberCount, subscription);
    }

    @Transactional
    public BoardResponse.StarToggle toggleStar(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 멤버 확인
        if (!boardMemberRepository.existsByBoardIdAndUserId(boardId, userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean isCurrentlyStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);

        if (isCurrentlyStarred) {
            userBoardStarRepository.deleteByUserIdAndBoardId(userId, boardId);
            log.info("Board unstarred: {} by user: {}", boardId, userId);
            return BoardResponse.StarToggle.builder()
                    .boardId(boardId)
                    .isStarred(false)
                    .build();
        } else {
            UserBoardStar star = UserBoardStar.create(user, board);
            userBoardStarRepository.save(star);
            log.info("Board starred: {} by user: {}", boardId, userId);
            return BoardResponse.StarToggle.builder()
                    .boardId(boardId)
                    .isStarred(true)
                    .build();
        }
    }

    /**
     * Personal Board에서 팀 전용 기능 접근 시 차단
     */
    public void checkTeamBoardOnly(String boardId) {
        boardRepository.findById(boardId).ifPresent(board -> {
            if (board.isPersonal()) {
                throw new BusinessException(ErrorCode.PERSONAL_BOARD_NO_INVITE);
            }
        });
    }

    // 권한 확인 헬퍼 메서드
    public BoardMember getMembershipOrThrow(String boardId, String userId) {
        return boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));
    }

    public void checkViewerOrAbove(String boardId, String userId) {
        if (boardMemberRepository.existsByBoardIdAndUserId(boardId, userId)) return;
        // System ADMIN can view any board without membership
        User user = userRepository.findById(userId).orElse(null);
        if (user != null && user.getSystemRole() == SystemRole.ADMIN) return;
        // Org member can view org boards as viewer
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.isOrganizationBoard()) {
            if (orgMemberRepository.existsByOrganizationIdAndUserId(
                    board.getOrganization().getId(), userId)) return;
        }
        throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
    }

    public void checkMemberOrAbove(String boardId, String userId) {
        java.util.Optional<BoardMember> membershipOpt = boardMemberRepository.findByBoardIdAndUserId(boardId, userId);
        if (membershipOpt.isPresent()) {
            if (!membershipOpt.get().isMemberOrAbove()) {
                throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
            }
            return;
        }
        // Org auto-access fallback
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.isOrganizationBoard()) {
            com.kanban.domain.organization.Organization org = board.getOrganization();
            if (Boolean.TRUE.equals(org.getAutoBoardAccessEnabled())
                    && orgMemberRepository.existsByOrganizationIdAndUserId(org.getId(), userId)) {
                return; // Virtual MEMBER
            }
        }
        throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
    }

    public void checkAdminOrAbove(String boardId, String userId) {
        BoardMember membership = getMembershipOrThrow(boardId, userId);
        if (!membership.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    public void checkOwner(String boardId, String userId) {
        BoardMember membership = getMembershipOrThrow(boardId, userId);
        if (!membership.isOwner()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    /**
     * 보드 티어 정보 조회
     */
    @Transactional
    public BoardResponse.TierInfo getBoardTier(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 멤버 확인
        checkViewerOrAbove(boardId, userId);

        // Trial 만료 체크 및 자동 전환
        if (board.checkAndUpdateTierIfTrialExpired()) {
            log.info("Board tier auto-downgraded to STANDARD: {}", boardId);
        }

        return BoardResponse.TierInfo.of(board);
    }

    /**
     * 보드 제한 정보 조회 (Task 개수 등)
     */
    public BoardResponse.Limits getBoardLimits(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 멤버 확인
        checkViewerOrAbove(boardId, userId);

        int currentTaskCount = taskRepository.countByBoardId(boardId);

        return BoardResponse.Limits.of(board, currentTaskCount);
    }
}
