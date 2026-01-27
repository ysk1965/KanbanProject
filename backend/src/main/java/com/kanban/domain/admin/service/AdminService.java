package com.kanban.domain.admin.service;

import com.kanban.domain.admin.dto.AdminRequest;
import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.board.*;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminService {

    private final UserRepository userRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TaskRepository taskRepository;

    // ==================== Users ====================

    public AdminResponse.UserList getUsers(int page, int size, String search) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Page<User> userPage;
        if (search != null && !search.isBlank()) {
            userPage = userRepository.findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
                    search, search, pageable);
        } else {
            userPage = userRepository.findAll(pageable);
        }

        List<AdminResponse.UserSummary> users = userPage.getContent().stream()
                .map(user -> {
                    int boardCount = boardRepository.countByUserInvolvement(user.getId());
                    return AdminResponse.UserSummary.of(user, boardCount);
                })
                .collect(Collectors.toList());

        return AdminResponse.UserList.builder()
                .users(users)
                .total(userPage.getTotalElements())
                .page(page)
                .size(size)
                .build();
    }

    public AdminResponse.UserDetail getUser(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        List<Board> boards = boardRepository.findByUserInvolvement(userId);
        int boardCount = boards.size();

        List<AdminResponse.BoardSummary> boardSummaries = boards.stream()
                .map(board -> {
                    int memberCount = (int) boardMemberRepository.countByBoardId(board.getId());
                    int taskCount = taskRepository.countByBoardId(board.getId());
                    Subscription subscription = subscriptionRepository.findByBoardId(board.getId()).orElse(null);
                    return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
                })
                .collect(Collectors.toList());

        return AdminResponse.UserDetail.of(user, boardCount, boardSummaries);
    }

    @Transactional
    public AdminResponse.UserSummary updateUser(String userId, AdminRequest.UpdateUser request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        user.updateSystemRole(request.getSystemRole());

        int boardCount = boardRepository.countByUserInvolvement(user.getId());
        return AdminResponse.UserSummary.of(user, boardCount);
    }

    public AdminResponse.BoardList getUserBoards(String userId) {
        userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        List<Board> boards = boardRepository.findByUserInvolvement(userId);

        List<AdminResponse.BoardSummary> boardSummaries = boards.stream()
                .map(board -> {
                    int memberCount = (int) boardMemberRepository.countByBoardId(board.getId());
                    int taskCount = taskRepository.countByBoardId(board.getId());
                    Subscription subscription = subscriptionRepository.findByBoardId(board.getId()).orElse(null);
                    return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
                })
                .collect(Collectors.toList());

        return AdminResponse.BoardList.builder()
                .boards(boardSummaries)
                .total(boardSummaries.size())
                .page(0)
                .size(boardSummaries.size())
                .build();
    }

    // ==================== Boards ====================

    public AdminResponse.BoardList getBoards(int page, int size, String search, BoardTier tier) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Page<Board> boardPage = boardRepository.findAllWithFilters(search, tier, pageable);

        List<AdminResponse.BoardSummary> boards = boardPage.getContent().stream()
                .map(board -> {
                    int memberCount = (int) boardMemberRepository.countByBoardId(board.getId());
                    int taskCount = taskRepository.countByBoardId(board.getId());
                    Subscription subscription = subscriptionRepository.findByBoardId(board.getId()).orElse(null);
                    return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
                })
                .collect(Collectors.toList());

        return AdminResponse.BoardList.builder()
                .boards(boards)
                .total(boardPage.getTotalElements())
                .page(page)
                .size(size)
                .build();
    }

    public AdminResponse.BoardDetail getBoard(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        int memberCount = (int) boardMemberRepository.countByBoardId(boardId);
        int taskCount = taskRepository.countByBoardId(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);
        List<AdminResponse.MemberInfo> members = boardMembers.stream()
                .map(AdminResponse.MemberInfo::of)
                .collect(Collectors.toList());

        return AdminResponse.BoardDetail.of(board, memberCount, taskCount, subscription, members);
    }

    @Transactional
    public void deleteBoard(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 관련 데이터 삭제 (cascade로 처리되지 않는 경우)
        boardMemberRepository.findByBoardId(boardId)
                .forEach(boardMemberRepository::delete);

        subscriptionRepository.findByBoardId(boardId)
                .ifPresent(subscriptionRepository::delete);

        boardRepository.delete(board);
    }

    @Transactional
    public AdminResponse.BoardSummary updateBoardTier(String boardId, AdminRequest.UpdateBoardTier request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // Tier 업데이트 로직
        BoardTier newTier = request.getTier();
        if (newTier == BoardTier.PREMIUM) {
            board.upgradeToPremium();
        } else if (newTier == BoardTier.STANDARD) {
            board.downgradeToStandard();
        }

        int memberCount = (int) boardMemberRepository.countByBoardId(boardId);
        int taskCount = taskRepository.countByBoardId(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
    }

    // ==================== Statistics ====================

    public AdminResponse.Statistics getStatistics() {
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countActiveUsers(LocalDateTime.now().minusDays(30));
        long totalBoards = boardRepository.count();
        long trialBoards = boardRepository.countByTier(BoardTier.TRIAL);
        long standardBoards = boardRepository.countByTier(BoardTier.STANDARD);
        long premiumBoards = boardRepository.countByTier(BoardTier.PREMIUM);
        long activeSubscriptions = subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE);

        return AdminResponse.Statistics.builder()
                .totalUsers(totalUsers)
                .activeUsers(activeUsers)
                .totalBoards(totalBoards)
                .trialBoards(trialBoards)
                .standardBoards(standardBoards)
                .premiumBoards(premiumBoards)
                .activeSubscriptions(activeSubscriptions)
                .build();
    }

    // ==================== Subscriptions ====================

    public AdminResponse.SubscriptionList getSubscriptions(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Page<Subscription> subscriptionPage = subscriptionRepository.findAllWithBoardAndOwner(pageable);

        List<AdminResponse.SubscriptionSummary> subscriptions = subscriptionPage.getContent().stream()
                .map(subscription -> AdminResponse.SubscriptionSummary.of(subscription, subscription.getBoard()))
                .collect(Collectors.toList());

        return AdminResponse.SubscriptionList.builder()
                .subscriptions(subscriptions)
                .total(subscriptionPage.getTotalElements())
                .page(page)
                .size(size)
                .build();
    }
}
