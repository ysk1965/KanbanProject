package com.kanban.domain.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.admin.dto.AdminRequest;
import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.announcement.Announcement;
import com.kanban.domain.announcement.AnnouncementRepository;
import com.kanban.domain.announcement.AnnouncementType;
import com.kanban.domain.auth.service.AuthService;
import com.kanban.domain.board.*;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.user.service.UserService;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.system.SystemConfig;
import com.kanban.domain.system.SystemConfigRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminService {

    private final UserRepository userRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TaskRepository taskRepository;
    private final AuthService authService;
    private final BoardService boardService;
    private final UserService userService;
    private final AnnouncementRepository announcementRepository;
    private final SystemConfigRepository systemConfigRepository;
    private final ObjectMapper objectMapper;

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
        Map<String, Integer> boardCountMap = boardRepository.countByUserInvolvementBatch(userIds).stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> ((Number) row[1]).intValue()
                ));

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
    public AdminResponse.UserSummary updateUser(String userId, AdminRequest.UpdateUser request, String adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 자기 자신의 Admin 역할 변경 방지
        if (userId.equals(adminId) && user.getSystemRole() == SystemRole.ADMIN
                && request.getSystemRole() != SystemRole.ADMIN) {
            throw new BusinessException(ErrorCode.CANNOT_DEMOTE_SELF);
        }

        // 마지막 Admin 제거 방지
        if (user.getSystemRole() == SystemRole.ADMIN && request.getSystemRole() != SystemRole.ADMIN) {
            long adminCount = userRepository.countBySystemRole(SystemRole.ADMIN);
            if (adminCount <= 1) {
                throw new BusinessException(ErrorCode.CANNOT_REMOVE_LAST_ADMIN);
            }
        }

        user.updateSystemRole(request.getSystemRole());
        log.info("User role updated by admin: userId={}, newRole={}, adminId={}", userId, request.getSystemRole(), adminId);

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

    // ==================== User Actions ====================

    @Transactional
    public AdminResponse.UserSummary deactivateUser(String userId, AdminRequest.DeactivateUser request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 관리자 계정은 비활성화 불가
        if (user.getSystemRole() == SystemRole.ADMIN) {
            throw new BusinessException(ErrorCode.CANNOT_DEACTIVATE_ADMIN);
        }

        // 이미 비활성화된 경우
        if (!user.getIsActive()) {
            throw new BusinessException(ErrorCode.USER_ALREADY_DEACTIVATED);
        }

        user.deactivate(request != null ? request.getReason() : null);
        log.info("User deactivated by admin: userId={}, reason={}", userId, request != null ? request.getReason() : "N/A");

        int boardCount = boardRepository.countByUserInvolvement(user.getId());
        return AdminResponse.UserSummary.of(user, boardCount);
    }

    @Transactional
    public AdminResponse.UserSummary activateUser(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 이미 활성화된 경우
        if (user.getIsActive()) {
            throw new BusinessException(ErrorCode.USER_ALREADY_ACTIVE);
        }

        user.activate();
        log.info("User activated by admin: userId={}", userId);

        int boardCount = boardRepository.countByUserInvolvement(user.getId());
        return AdminResponse.UserSummary.of(user, boardCount);
    }

    @Transactional
    public AdminResponse.UserSummary verifyUserEmailByAdmin(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        if (user.getEmailVerified()) {
            throw new BusinessException(ErrorCode.ALREADY_VERIFIED);
        }

        user.verifyEmail();
        log.info("User email verified by admin: userId={}", userId);

        int boardCount = boardRepository.countByUserInvolvement(user.getId());
        return AdminResponse.UserSummary.of(user, boardCount);
    }

    @Transactional
    public void sendPasswordResetEmailByAdmin(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Google 계정은 비밀번호 리셋 불가
        if ("GOOGLE".equalsIgnoreCase(user.getAuthProvider())) {
            throw new BusinessException(ErrorCode.GOOGLE_USER_NO_PASSWORD);
        }

        authService.requestPasswordReset(user.getEmail());
        log.info("Password reset email sent by admin: userId={}, email={}", userId, user.getEmail());
    }

    @Transactional
    public void deleteUserByAdmin(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 관리자 계정은 삭제 불가
        if (user.getSystemRole() == SystemRole.ADMIN) {
            throw new BusinessException(ErrorCode.CANNOT_DELETE_ADMIN_USER);
        }

        // 활성 상태의 사용자는 삭제 불가 (먼저 비활성화 필요)
        if (user.getIsActive()) {
            throw new BusinessException(ErrorCode.CANNOT_DELETE_ACTIVE_USER);
        }

        // 보드 Owner인 경우 삭제 불가
        if (boardMemberRepository.existsByUserIdAndRole(userId, BoardRole.OWNER)) {
            throw new BusinessException(ErrorCode.CANNOT_DELETE_BOARD_OWNER);
        }

        // UserService의 deleteAccount 로직 재사용
        userService.deleteAccount(userId);
        log.info("User permanently deleted by admin: userId={}", userId);
    }

    @Transactional
    public void removeUserFromBoard(String userId, String boardId) {
        userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        BoardMember member = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        // Owner는 내보낼 수 없음
        if (member.isOwner()) {
            throw new BusinessException(ErrorCode.CANNOT_REMOVE_OWNER);
        }

        boardMemberRepository.delete(member);
        log.info("User removed from board by admin: userId={}, boardId={}", userId, boardId);
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
        boardService.deleteBoardByAdmin(boardId);
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

    @Transactional
    public AdminResponse.BoardDetail transferBoardOwnership(String boardId, AdminRequest.TransferOwnership request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User newOwner = userRepository.findById(request.getNewOwnerId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        User oldOwner = board.getOwner();

        // 같은 사용자에게 이전하려는 경우
        if (oldOwner.getId().equals(newOwner.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 1. 새 Owner가 이미 멤버인지 확인
        Optional<BoardMember> existingMember = boardMemberRepository.findByBoardIdAndUserId(boardId, newOwner.getId());

        if (existingMember.isPresent()) {
            // 기존 멤버면 OWNER로 역할 변경
            existingMember.get().updateRole(BoardRole.OWNER);
        } else {
            // 새 멤버로 추가
            BoardMember newMember = BoardMember.builder()
                    .board(board)
                    .user(newOwner)
                    .role(BoardRole.OWNER)
                    .joinedAt(LocalDateTime.now(ZoneOffset.UTC))
                    .build();
            boardMemberRepository.save(newMember);
        }

        // 2. 기존 Owner를 ADMIN으로 변경
        boardMemberRepository.findByBoardIdAndUserId(boardId, oldOwner.getId())
                .ifPresent(member -> member.updateRole(BoardRole.ADMIN));

        // 3. Board의 owner 필드 업데이트
        board.updateOwner(newOwner);

        log.info("Board ownership transferred by admin: boardId={}, oldOwner={}, newOwner={}",
                boardId, oldOwner.getId(), newOwner.getId());

        return getBoard(boardId);
    }

    @Transactional
    public AdminResponse.BoardSummary extendTrial(String boardId, AdminRequest.ExtendTrial request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        LocalDateTime newTrialEndsAt;
        if (request.getNewTrialEndsAt() != null) {
            newTrialEndsAt = request.getNewTrialEndsAt();
        } else if (request.getExtendDays() != null && request.getExtendDays() > 0) {
            LocalDateTime current = board.getTrialEndsAt() != null
                    ? board.getTrialEndsAt()
                    : LocalDateTime.now(ZoneOffset.UTC);
            newTrialEndsAt = current.plusDays(request.getExtendDays());
        } else {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        board.extendTrial(newTrialEndsAt);

        log.info("Board trial extended by admin: boardId={}, newTrialEndsAt={}", boardId, newTrialEndsAt);

        int memberCount = (int) boardMemberRepository.countByBoardId(boardId);
        int taskCount = taskRepository.countByBoardId(boardId);
        Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);

        return AdminResponse.BoardSummary.of(board, memberCount, taskCount, subscription);
    }

    @Transactional
    public AdminResponse.BoardDetail updateBoardName(String boardId, AdminRequest.UpdateBoardName request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        board.updateInfo(request.getName(), null);

        log.info("Board name updated by admin: boardId={}, newName={}", boardId, request.getName());

        return getBoard(boardId);
    }

    @Transactional
    public AdminResponse.BoardDetail updateSeatCount(String boardId, AdminRequest.UpdateSeatCount request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        subscription.updateSeatCount(request.getSeatCount());

        log.info("Board seat count updated by admin: boardId={}, seatCount={}", boardId, request.getSeatCount());

        return getBoard(boardId);
    }

    @Transactional
    public AdminResponse.BoardDetail updateMemberRole(String boardId, String memberId, AdminRequest.UpdateMemberRole request) {
        boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember boardMember = boardMemberRepository.findByBoardIdAndUserId(boardId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        // OWNER 역할은 transferOwnership을 통해서만 변경 가능
        if (boardMember.getRole() == BoardRole.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        // OWNER로 변경하려는 경우도 transferOwnership 사용
        if (request.getRole() == BoardRole.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        boardMember.updateRole(request.getRole());

        log.info("Board member role updated by admin: boardId={}, memberId={}, newRole={}",
                boardId, memberId, request.getRole());

        return getBoard(boardId);
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
        LocalDateTime activeThreshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(30);

        // 병렬로 3그룹 조회 (7개 → 3개 쿼리)
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countActiveUsers(activeThreshold);

        // Board tier 카운트를 한번에 조회
        long totalBoards = boardRepository.count();
        Map<BoardTier, Long> tierCounts = new java.util.EnumMap<>(BoardTier.class);
        for (BoardTier tier : BoardTier.values()) {
            tierCounts.put(tier, 0L);
        }
        boardRepository.countGroupedByTier().forEach(row ->
                tierCounts.put((BoardTier) row[0], (Long) row[1])
        );

        long activeSubscriptions = subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE);

        return AdminResponse.Statistics.builder()
                .totalUsers(totalUsers)
                .activeUsers(activeUsers)
                .totalBoards(totalBoards)
                .trialBoards(tierCounts.getOrDefault(BoardTier.TRIAL, 0L))
                .standardBoards(tierCounts.getOrDefault(BoardTier.STANDARD, 0L))
                .premiumBoards(tierCounts.getOrDefault(BoardTier.PREMIUM, 0L))
                .activeSubscriptions(activeSubscriptions)
                .build();
    }

    // ==================== Analytics ====================

    public AdminResponse.SignupTrend getSignupTrend(int days) {
        LocalDateTime startDate = LocalDateTime.now(ZoneOffset.UTC).minusDays(days);
        List<Object[]> rows = userRepository.getSignupTrendDaily(startDate);

        long total = 0;
        List<AdminResponse.SignupTrend.SignupTrendData> data = new java.util.ArrayList<>();
        for (Object[] row : rows) {
            String date = row[0].toString();
            long count = ((Number) row[1]).longValue();
            long emailCount = ((Number) row[2]).longValue();
            long googleCount = ((Number) row[3]).longValue();
            total += count;
            data.add(AdminResponse.SignupTrend.SignupTrendData.builder()
                    .date(date)
                    .count(count)
                    .emailCount(emailCount)
                    .googleCount(googleCount)
                    .build());
        }

        return AdminResponse.SignupTrend.builder()
                .data(data)
                .total(total)
                .build();
    }

    public AdminResponse.ActiveUserStats getActiveUserStats(int days) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        long dau = userRepository.countActiveUsers(now.minusDays(1));
        long wau = userRepository.countActiveUsers(now.minusDays(7));
        long mau = userRepository.countActiveUsers(now.minusDays(30));

        List<Object[]> rows = userRepository.getDailyActiveUserTrend(now.minusDays(days));
        List<AdminResponse.ActiveUserStats.DailyActiveData> trend = new java.util.ArrayList<>();
        for (Object[] row : rows) {
            trend.add(AdminResponse.ActiveUserStats.DailyActiveData.builder()
                    .date(row[0].toString())
                    .count(((Number) row[1]).longValue())
                    .build());
        }

        return AdminResponse.ActiveUserStats.builder()
                .dau(dau)
                .wau(wau)
                .mau(mau)
                .trend(trend)
                .build();
    }

    public AdminResponse.ConversionStats getConversionStats(int days) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime startDate = now.minusDays(days);

        long totalTrialStarted = subscriptionRepository.count();
        long totalConverted = subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE);
        long trialInProgress = subscriptionRepository.countByStatus(SubscriptionStatus.TRIAL);
        long trialExpiredNotConverted = subscriptionRepository.countTrialExpiredNotConverted(now);
        double conversionRate = totalTrialStarted > 0
                ? (double) totalConverted / totalTrialStarted * 100
                : 0.0;

        List<Object[]> trialRows = subscriptionRepository.getMonthlyTrialStarted(startDate);
        List<Object[]> convertedRows = subscriptionRepository.getMonthlyConverted(startDate);

        Map<String, Long> trialMap = new java.util.LinkedHashMap<>();
        for (Object[] row : trialRows) {
            trialMap.put(row[0].toString(), ((Number) row[1]).longValue());
        }
        Map<String, Long> convertedMap = new java.util.LinkedHashMap<>();
        for (Object[] row : convertedRows) {
            convertedMap.put(row[0].toString(), ((Number) row[1]).longValue());
        }

        java.util.Set<String> allMonths = new java.util.TreeSet<>();
        allMonths.addAll(trialMap.keySet());
        allMonths.addAll(convertedMap.keySet());

        List<AdminResponse.ConversionStats.MonthlyConversion> trend = new java.util.ArrayList<>();
        for (String month : allMonths) {
            long started = trialMap.getOrDefault(month, 0L);
            long converted = convertedMap.getOrDefault(month, 0L);
            double rate = started > 0 ? (double) converted / started * 100 : 0.0;
            trend.add(AdminResponse.ConversionStats.MonthlyConversion.builder()
                    .month(month)
                    .trialStarted(started)
                    .converted(converted)
                    .rate(Math.round(rate * 10.0) / 10.0)
                    .build());
        }

        return AdminResponse.ConversionStats.builder()
                .totalTrialStarted(totalTrialStarted)
                .totalConverted(totalConverted)
                .conversionRate(Math.round(conversionRate * 10.0) / 10.0)
                .trialInProgress(trialInProgress)
                .trialExpiredNotConverted(trialExpiredNotConverted)
                .trend(trend)
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

    // ==================== Announcements ====================

    public List<AdminResponse.AnnouncementDetail> getAllAnnouncements() {
        return announcementRepository.findAllByOrderByPriorityDescCreatedAtDesc().stream()
                .map(AdminResponse.AnnouncementDetail::of)
                .collect(Collectors.toList());
    }

    public List<AdminResponse.AnnouncementDetail> getActiveAnnouncements() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        log.debug("📢 [Announcements] Current server time (UTC): {}", now);

        List<Announcement> active = announcementRepository.findActiveAnnouncements(now);
        log.debug("📢 [Announcements] Active count: {}", active.size());

        return active.stream()
                .map(AdminResponse.AnnouncementDetail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public AdminResponse.AnnouncementDetail createAnnouncement(AdminRequest.CreateAnnouncement request) {
        Announcement announcement = Announcement.builder()
                .title(request.getTitle())
                .content(request.getContent())
                .type(request.getType() != null ? request.getType() : AnnouncementType.NOTICE)
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .startAt(request.getStartAt())
                .endAt(normalizeEndAt(request.getEndAt()))
                .priority(request.getPriority() != null ? request.getPriority() : 0)
                .targetRole(request.getTargetRole())
                .build();

        announcementRepository.save(announcement);
        return AdminResponse.AnnouncementDetail.of(announcement);
    }

    @Transactional
    public AdminResponse.AnnouncementDetail updateAnnouncement(String id, AdminRequest.CreateAnnouncement request) {
        Announcement announcement = announcementRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ANNOUNCEMENT_NOT_FOUND));

        announcement.update(
                request.getTitle(),
                request.getContent(),
                request.getType() != null ? request.getType() : announcement.getType(),
                request.getIsActive() != null ? request.getIsActive() : announcement.getIsActive(),
                request.getStartAt(),
                normalizeEndAt(request.getEndAt()),
                request.getPriority() != null ? request.getPriority() : announcement.getPriority(),
                request.getTargetRole()
        );

        return AdminResponse.AnnouncementDetail.of(announcement);
    }

    /**
     * 종료일이 자정(00:00)이면 해당 날짜의 마지막 시각(23:59:59)으로 보정.
     * Admin에서 날짜만 선택하면 00:00으로 들어오는데, "해당 날짜까지 표시"를 의미하므로.
     */
    private LocalDateTime normalizeEndAt(LocalDateTime endAt) {
        if (endAt != null && endAt.toLocalTime().equals(LocalTime.MIDNIGHT)) {
            return endAt.withHour(23).withMinute(59).withSecond(59);
        }
        return endAt;
    }

    @Transactional
    public void deleteAnnouncement(String id) {
        Announcement announcement = announcementRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ANNOUNCEMENT_NOT_FOUND));
        announcementRepository.delete(announcement);
    }

    // ==================== System (Maintenance) ====================

    private static final String MAINTENANCE_KEY = "maintenance_mode";

    public AdminResponse.MaintenanceStatus getMaintenanceStatus() {
        Optional<SystemConfig> config = systemConfigRepository.findById(MAINTENANCE_KEY);
        if (config.isEmpty() || config.get().getValue() == null) {
            return AdminResponse.MaintenanceStatus.builder()
                    .enabled(false)
                    .build();
        }

        try {
            MaintenanceData data = objectMapper.readValue(config.get().getValue(), MaintenanceData.class);
            return AdminResponse.MaintenanceStatus.builder()
                    .enabled(data.enabled)
                    .message(data.message)
                    .estimatedEndAt(data.estimatedEndAt)
                    .startedAt(data.startedAt)
                    .build();
        } catch (Exception e) {
            log.error("Failed to parse maintenance config", e);
            return AdminResponse.MaintenanceStatus.builder()
                    .enabled(false)
                    .build();
        }
    }

    @Transactional
    public AdminResponse.MaintenanceStatus setMaintenanceMode(AdminRequest.SetMaintenance request) {
        // 기존 설정 조회 (시작 시간 유지를 위해)
        LocalDateTime existingStartedAt = null;
        boolean wasEnabled = false;
        Optional<SystemConfig> existingConfig = systemConfigRepository.findById(MAINTENANCE_KEY);
        if (existingConfig.isPresent() && existingConfig.get().getValue() != null) {
            try {
                MaintenanceData existingData = objectMapper.readValue(existingConfig.get().getValue(), MaintenanceData.class);
                existingStartedAt = existingData.startedAt;
                wasEnabled = existingData.enabled;
            } catch (Exception e) {
                log.warn("Failed to read existing maintenance config", e);
            }
        }

        MaintenanceData data = new MaintenanceData();
        data.enabled = request.getEnabled();
        data.message = request.getMessage();
        data.estimatedEndAt = request.getEstimatedEndAt();

        // 시작 시간 결정:
        // - OFF로 변경: null
        // - 기존 ON → ON 유지: 기존 시작 시간 유지
        // - OFF → ON 변경: 현재 시간
        if (!request.getEnabled()) {
            data.startedAt = null;
        } else if (wasEnabled && existingStartedAt != null) {
            data.startedAt = existingStartedAt;
        } else {
            data.startedAt = LocalDateTime.now(ZoneOffset.UTC);
        }

        try {
            String json = objectMapper.writeValueAsString(data);

            SystemConfig config = existingConfig
                    .orElse(SystemConfig.builder()
                            .key(MAINTENANCE_KEY)
                            .build());
            config.updateValue(json);
            systemConfigRepository.save(config);
        } catch (Exception e) {
            log.error("Failed to save maintenance config", e);
        }

        return AdminResponse.MaintenanceStatus.builder()
                .enabled(data.enabled)
                .message(data.message)
                .estimatedEndAt(data.estimatedEndAt)
                .startedAt(data.startedAt)
                .build();
    }

    private static class MaintenanceData {
        public boolean enabled;
        public String message;
        public LocalDateTime estimatedEndAt;
        public LocalDateTime startedAt;
    }
}
