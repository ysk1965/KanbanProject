package com.kanban.domain.board.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.*;
import com.kanban.domain.board.dto.BoardRequest;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
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

    @Transactional
    public BoardResponse.Detail createBoard(String userId, BoardRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean isTester = user.getSystemRole() == SystemRole.TESTER;

        // 보드 생성 (TESTER는 PREMIUM 티어)
        Board board = Board.builder()
                .name(request.getName())
                .description(request.getDescription())
                .owner(user)
                .tier(isTester ? BoardTier.PREMIUM : BoardTier.TRIAL)
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

        // 구독 생성 (TESTER는 PREMIUM, 일반 사용자는 Trial)
        Subscription subscription = isTester
                ? Subscription.createPremium(board)
                : Subscription.createTrial(board);
        subscriptionRepository.save(subscription);

        log.info("Board created: {} by user: {}", board.getId(), userId);

        return BoardResponse.Detail.of(board, BoardRole.OWNER, false, 1, subscription);
    }

    private void createDefaultBlocks(Board board) {
        Block featureBlock = Block.createFixedBlock(board, FixedBlockType.FEATURE, 0);
        Block taskBlock = Block.createFixedBlock(board, FixedBlockType.TASK, 1);
        Block doneBlock = Block.createFixedBlock(board, FixedBlockType.DONE, 999);

        blockRepository.save(featureBlock);
        blockRepository.save(taskBlock);
        blockRepository.save(doneBlock);
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

        boolean isStarred = userBoardStarRepository.existsByUserIdAndBoardId(userId, boardId);
        int memberCount = boardMemberRepository.countBillableMembers(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        log.info("Board updated: {} by user: {}", boardId, userId);

        return BoardResponse.Detail.of(board, membership.getRole(), isStarred, memberCount, subscription);
    }

    @Transactional
    public void deleteBoard(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // TODO: 관련 데이터 삭제 (blocks, features, tasks, etc.)

        boardRepository.delete(board);
        log.info("Board deleted: {} by user: {}", boardId, userId);
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

    // 권한 확인 헬퍼 메서드
    public BoardMember getMembershipOrThrow(String boardId, String userId) {
        return boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));
    }

    public void checkViewerOrAbove(String boardId, String userId) {
        getMembershipOrThrow(boardId, userId);
    }

    public void checkMemberOrAbove(String boardId, String userId) {
        BoardMember membership = getMembershipOrThrow(boardId, userId);
        if (!membership.isMemberOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
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
