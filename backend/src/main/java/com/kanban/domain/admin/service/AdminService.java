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
import java.util.Collections;
import java.util.List;
import java.util.Map;
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

        // Batch load: 유저별 보드 수 (N+1 방지)
        List<String> userIds = userPage.getContent().stream().map(User::getId).collect(Collectors.toList());
        Map<String, Integer> boardCountMap = new java.util.HashMap<>();
        for (User user : userPage.getContent()) {
            boardCountMap.put(user.getId(), boardRepository.countByUserInvolvement(user.getId()));
        }

        List<AdminResponse.UserSummary> users = userPage.getContent().stream()
                .map(user -> AdminResponse.UserSummary.of(user, boardCountMap.getOrDefault(user.getId(), 0)))
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

        List<AdminResponse.BoardSummary> boardSummaries = toBoardSummaries(boards);

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

        List<AdminResponse.BoardSummary> boardSummaries = toBoardSummaries(boards);

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

        List<AdminResponse.BoardSummary> boards = toBoardSummaries(boardPage.getContent());

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
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        if (newTier == BoardTier.PREMIUM) {
            board.upgradeToPremium();
            if (subscription != null) {
                subscription.upgradeByAdmin();
            }
        } else if (newTier == BoardTier.STANDARD) {
            board.downgradeToStandard();
            if (subscription != null) {
                subscription.downgradeByAdmin();
            }
        }

        int memberCount = (int) boardMemberRepository.countByBoardId(boardId);
        int taskCount = taskRepository.countByBoardId(boardId);

        return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
    }

    // ==================== Helper Methods ====================

    /**
     * 여러 보드의 요약 정보를 배치 조회하여 생성 (N+1 방지)
     */
    private List<AdminResponse.BoardSummary> toBoardSummaries(List<Board> boards) {
        if (boards.isEmpty()) return Collections.emptyList();

        List<String> boardIds = boards.stream().map(Board::getId).collect(Collectors.toList());

        // 배치 조회: memberCount, taskCount, subscription
        Map<String, Long> memberCountMap = boardMemberRepository.countGroupedByBoardId(boardIds).stream()
                .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));

        Map<String, Long> taskCountMap = taskRepository.countGroupedByBoardId(boardIds).stream()
                .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));

        Map<String, Subscription> subscriptionMap = subscriptionRepository.findByBoardIdIn(boardIds).stream()
                .collect(Collectors.toMap(s -> s.getBoard().getId(), s -> s, (a, b) -> a));

        return boards.stream()
                .map(board -> AdminResponse.BoardSummary.of(
                        board,
                        memberCountMap.getOrDefault(board.getId(), 0L).intValue(),
                        taskCountMap.getOrDefault(board.getId(), 0L).intValue(),
                        subscriptionMap.get(board.getId())))
                .collect(Collectors.toList());
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
