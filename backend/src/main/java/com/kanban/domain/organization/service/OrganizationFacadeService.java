package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.dto.BoardRequest;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.organization.OrgActivityType;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.dto.OrgBoardRequest;
import com.kanban.domain.organization.dto.OrgBoardResponse;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.subscription.service.OrgSubscriptionService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrganizationFacadeService {

    private final OrganizationRepository organizationRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;
    private final BoardService boardService;
    private final OrgSubscriptionService orgSubscriptionService;

    public List<OrgBoardResponse.Simple> getOrgBoards(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        List<Board> boards = boardRepository.findByOrganizationId(orgId);

        if (boards.isEmpty()) {
            return List.of();
        }

        List<String> boardIds = boards.stream().map(Board::getId).toList();

        // Bulk member count query (N+1 prevention)
        Map<String, Long> memberCountMap = boardMemberRepository.countGroupedByBoardId(boardIds).stream()
                .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));

        // Bulk member preview query (max 5 per board)
        Map<String, List<OrgBoardResponse.MemberPreview>> memberPreviewMap = boardIds.stream()
                .collect(Collectors.toMap(
                        boardId -> boardId,
                        boardId -> boardMemberRepository.findTopMembersByBoardId(boardId, 5).stream()
                                .map(bm -> OrgBoardResponse.MemberPreview.builder()
                                        .id(bm.getUser().getId())
                                        .name(bm.getUser().getName())
                                        .profileImage(bm.getUser().getProfileImage())
                                        .build())
                                .toList()
                ));

        // Bulk time aggregation - total
        Map<String, Long> totalMinutesMap = scheduleBlockRepository.sumMinutesGroupByBoard(boardIds).stream()
                .collect(Collectors.toMap(row -> (String) row[0], row -> (Long) row[1]));

        // Bulk time aggregation - this month
        LocalDate now = LocalDate.now(ZoneOffset.UTC);
        LocalDate monthStart = now.withDayOfMonth(1);
        Map<String, Long> monthlyMinutesMap = scheduleBlockRepository.sumMinutesGroupByBoardAndDate(boardIds, monthStart, now).stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> (Long) row[2],
                        Long::sum
                ));

        // Weekly time aggregation - last 10 weeks (1 bulk query, grouped by board+date)
        LocalDate thisWeekStart = now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate tenWeeksAgo = thisWeekStart.minusWeeks(9);
        List<Object[]> dailyRows = scheduleBlockRepository.sumMinutesGroupByBoardAndDate(boardIds, tenWeeksAgo, now);

        // Build weekStart list (10 weeks)
        List<LocalDate> weekStarts = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            weekStarts.add(tenWeeksAgo.plusWeeks(i));
        }

        // Group daily data into weekly buckets per board
        // Map<boardId, Map<weekStart, minutes>>
        Map<String, Map<LocalDate, Long>> weeklyMap = new HashMap<>();
        for (Object[] row : dailyRows) {
            String boardId = (String) row[0];
            LocalDate date = (LocalDate) row[1];
            long minutes = (Long) row[2];
            LocalDate weekStart = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            weeklyMap.computeIfAbsent(boardId, k -> new HashMap<>())
                    .merge(weekStart, minutes, Long::sum);
        }

        return boards.stream().map(board -> {
            String bid = board.getId();
            Map<LocalDate, Long> boardWeekly = weeklyMap.getOrDefault(bid, Map.of());
            List<OrgBoardResponse.WeeklyTime> weeklyTimes = weekStarts.stream()
                    .map(ws -> OrgBoardResponse.WeeklyTime.builder()
                            .weekStart(ws)
                            .minutes(boardWeekly.getOrDefault(ws, 0L))
                            .build())
                    .toList();

            return OrgBoardResponse.Simple.of(
                    board,
                    memberCountMap.getOrDefault(bid, 0L).intValue(),
                    totalMinutesMap.getOrDefault(bid, 0L),
                    monthlyMinutesMap.getOrDefault(bid, 0L),
                    memberPreviewMap.getOrDefault(bid, List.of()),
                    weeklyTimes
            );
        }).collect(Collectors.toList());
    }

    public OrgBoardResponse.EligibilityCheck checkBoardEligibility(String orgId, String boardId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // Check board is not already in an org
        if (board.getOrganization() != null) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_IN_ORG);
        }

        // Check user is Board Owner
        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // Get all board members and check if they are org members
        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);
        List<OrgBoardResponse.NonOrgMemberInfo> nonOrgMembers = new ArrayList<>();

        for (BoardMember bm : boardMembers) {
            if (!orgMemberRepository.existsByOrganizationIdAndUserId(orgId, bm.getUser().getId())) {
                nonOrgMembers.add(OrgBoardResponse.NonOrgMemberInfo.builder()
                        .userId(bm.getUser().getId())
                        .name(bm.getUser().getName())
                        .email(bm.getUser().getEmail())
                        .build());
            }
        }

        return OrgBoardResponse.EligibilityCheck.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .isEligible(nonOrgMembers.isEmpty())
                .totalMembers(boardMembers.size())
                .nonOrgMembers(nonOrgMembers)
                .build();
    }

    @Transactional
    public OrgBoardResponse.Simple addBoardToOrg(String orgId, String boardId, String userId) {
        // Use pessimistic lock to prevent R1/R3 race condition
        Organization org = organizationRepository.findActiveByIdWithLock(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
        organizationService.checkAdminOrAbove(orgId, userId);

        // Require Team plan to add boards to org
        if (!orgSubscriptionService.canCreateOrgBoard(orgId)) {
            throw new BusinessException(ErrorCode.ORG_BOARD_REQUIRES_TEAM);
        }

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (board.getOrganization() != null) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_IN_ORG);
        }

        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // R1: Verify all board members are org members
        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);
        for (BoardMember bm : boardMembers) {
            if (!orgMemberRepository.existsByOrganizationIdAndUserId(orgId, bm.getUser().getId())) {
                throw new BusinessException(ErrorCode.BOARD_NOT_ELIGIBLE_FOR_ORG);
            }
        }

        board.setOrganization(org);
        board.updateTier(BoardTier.ORG_MANAGED);
        int memberCount = boardMembers.size();
        List<OrgBoardResponse.MemberPreview> members = boardMembers.stream()
                .limit(5)
                .map(bm -> OrgBoardResponse.MemberPreview.builder()
                        .id(bm.getUser().getId())
                        .name(bm.getUser().getName())
                        .profileImage(bm.getUser().getProfileImage())
                        .build())
                .toList();

        // Log activity
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_ADDED, board.getName(), null);

        log.info("Board added to organization: boardId={}, orgId={}", boardId, orgId);
        return OrgBoardResponse.Simple.of(board, memberCount, 0L, 0L, members, List.of());
    }

    @Transactional
    public void removeBoardFromOrg(String orgId, String boardId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (board.getOrganization() == null || !board.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.BOARD_NOT_IN_ORG);
        }

        // Log activity before removing
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_REMOVED, board.getName(), null);

        board.updateTier(BoardTier.STANDARD);
        board.removeOrganization();
        log.info("Board removed from organization: boardId={}, orgId={}", boardId, orgId);
    }

    @Transactional
    public OrgBoardResponse.Simple createBoardForOrg(String orgId, OrgBoardRequest.CreateBoard request, String userId) {
        Organization org = organizationRepository.findActiveByIdWithLock(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
        organizationService.checkAdminOrAbove(orgId, userId);

        // Require Team plan to create boards for org
        if (!orgSubscriptionService.canCreateOrgBoard(orgId)) {
            throw new BusinessException(ErrorCode.ORG_BOARD_REQUIRES_TEAM);
        }

        // Create board via BoardService (creates board + owner member + default blocks + subscription)
        BoardRequest.Create boardRequest = new BoardRequest.Create(request.getName(), request.getDescription(), null);
        BoardResponse.Detail detail = boardService.createBoard(userId, boardRequest);

        // Link to organization
        Board board = boardRepository.findActiveById(detail.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        board.setOrganization(org);
        board.updateTier(BoardTier.ORG_MANAGED);

        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(board.getId());
        List<OrgBoardResponse.MemberPreview> members = boardMembers.stream()
                .limit(5)
                .map(bm -> OrgBoardResponse.MemberPreview.builder()
                        .id(bm.getUser().getId())
                        .name(bm.getUser().getName())
                        .profileImage(bm.getUser().getProfileImage())
                        .build())
                .toList();

        // Log activity
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_CREATED, board.getName(), null);

        log.info("Board created for organization: boardId={}, orgId={}", board.getId(), orgId);
        return OrgBoardResponse.Simple.of(board, boardMembers.size(), 0L, 0L, members, List.of());
    }
}
