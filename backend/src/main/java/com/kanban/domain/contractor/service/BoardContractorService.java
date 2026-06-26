package com.kanban.domain.contractor.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.contractor.dto.BoardContractorRequest;
import com.kanban.domain.contractor.dto.BoardContractorResponse;
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.contractor.entity.BoardContractorPeriod;
import com.kanban.domain.contractor.repository.BoardContractorPeriodRepository;
import com.kanban.domain.contractor.repository.BoardContractorRepository;
import com.kanban.domain.jobrole.entity.JobRole;
import com.kanban.domain.jobrole.repository.JobRoleRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardContractorService {

    private final BoardContractorRepository contractorRepository;
    private final BoardContractorPeriodRepository periodRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final JobRoleRepository jobRoleRepository;
    private final BoardService boardService;
    private final UserRepository userRepository;
    private final WebSocketEventService webSocketEventService;

    public BoardContractorResponse.ListResponse list(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<BoardContractor> contractors = contractorRepository.findAllByBoardIdOrdered(boardId);
        List<BoardContractorResponse.Detail> details = contractors.stream()
                .map(BoardContractorResponse.Detail::of)
                .toList();

        return BoardContractorResponse.ListResponse.of(details);
    }

    @Transactional
    public BoardContractorResponse.Detail create(String boardId, String userId, BoardContractorRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        BoardMember manager = boardMemberRepository.findById(request.getManagerMemberId())
                .filter(m -> m.getBoard().getId().equals(boardId))
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_MANAGER_INVALID));

        // 일반 Member 는 본인이 manager 인 외주만 생성 가능, Admin+ 는 누구든 가능
        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        if (!requester.isAdminOrAbove() && !manager.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        if (contractorRepository.existsByBoardIdAndName(boardId, request.getName())) {
            throw new BusinessException(ErrorCode.CONTRACTOR_ALREADY_EXISTS);
        }

        JobRole jobRole = null;
        if (request.getJobRoleId() != null && !request.getJobRoleId().isBlank()) {
            jobRole = jobRoleRepository.findByIdAndBoardId(request.getJobRoleId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.JOB_ROLE_NOT_FOUND));
        }

        Integer nextOrder = contractorRepository.findAllByBoardIdOrdered(boardId).size() + 1;

        BoardContractor contractor = BoardContractor.builder()
                .board(board)
                .manager(manager)
                .jobRole(jobRole)
                .name(request.getName())
                .color(request.getColor())
                .displayOrder(nextOrder)
                .build();

        contractorRepository.save(contractor);

        // 최초 기간이 함께 들어오면 첫 계약 기간으로 생성
        if (request.getStartDate() != null || request.getEndDate() != null) {
            validatePeriod(request.getStartDate(), request.getEndDate());
            contractor.addPeriod(BoardContractorPeriod.builder()
                    .startDate(request.getStartDate())
                    .endDate(request.getEndDate())
                    .build());
            contractorRepository.saveAndFlush(contractor);
        }

        log.info("Contractor created: {} in board: {} by user: {}", contractor.getId(), boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    @Transactional
    public BoardContractorResponse.Detail update(String boardId, String contractorId, String userId,
                                                  BoardContractorRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));

        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        if (request.getName() != null && !request.getName().equals(contractor.getName())) {
            if (contractorRepository.existsByBoardIdAndName(boardId, request.getName())) {
                throw new BusinessException(ErrorCode.CONTRACTOR_ALREADY_EXISTS);
            }
        }

        contractor.updateInfo(request.getName(), request.getColor());

        // 기간(periods)은 별도 기간 엔드포인트(addPeriod/updatePeriod/deletePeriod)로 관리

        if (request.getManagerMemberId() != null) {
            BoardMember newManager = boardMemberRepository.findById(request.getManagerMemberId())
                    .filter(m -> m.getBoard().getId().equals(boardId))
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_MANAGER_INVALID));
            // 일반 Member 는 본인을 manager 로 두는 변경만 허용
            if (!requester.isAdminOrAbove() && !newManager.getUser().getId().equals(userId)) {
                throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
            }
            contractor.updateManager(newManager);
        }

        if (request.getJobRoleId() != null) {
            if (request.getJobRoleId().isBlank()) {
                contractor.updateJobRole(null);
            } else {
                JobRole jobRole = jobRoleRepository.findByIdAndBoardId(request.getJobRoleId(), boardId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.JOB_ROLE_NOT_FOUND));
                contractor.updateJobRole(jobRole);
            }
        }

        log.info("Contractor updated: {} in board: {} by user: {}", contractorId, boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    @Transactional
    public void delete(String boardId, String contractorId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));

        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        contractorRepository.delete(contractor);

        log.info("Contractor deleted: {} in board: {} by user: {}", contractorId, boardId, userId);

        broadcastUpdate(boardId, userId);
    }

    @Transactional
    public BoardContractorResponse.Detail setHidden(String boardId, String contractorId, String userId,
                                                    BoardContractorRequest.Visibility request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        contractor.updateHidden(request.isHidden());

        log.info("Contractor visibility changed: contractor={} hidden={} board={} by user={}",
                contractorId, request.isHidden(), boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    // ─── 계약 기간(periods) 관리 ───

    @Transactional
    public BoardContractorResponse.Detail addPeriod(String boardId, String contractorId, String userId,
                                                    BoardContractorRequest.PeriodCreate request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        validatePeriod(request.getStartDate(), request.getEndDate());
        contractor.addPeriod(BoardContractorPeriod.builder()
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .build());
        contractorRepository.saveAndFlush(contractor);

        log.info("Contractor period added: contractor={} board={} by user={}", contractorId, boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    @Transactional
    public BoardContractorResponse.Detail updatePeriod(String boardId, String contractorId, String periodId,
                                                       String userId, BoardContractorRequest.PeriodUpdate request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        BoardContractorPeriod period = periodRepository.findByIdAndContractorId(periodId, contractorId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));

        LocalDate newStart = request.isClearStartDate() ? null
                : (request.getStartDate() != null ? request.getStartDate() : period.getStartDate());
        LocalDate newEnd = request.isClearEndDate() ? null
                : (request.getEndDate() != null ? request.getEndDate() : period.getEndDate());
        validatePeriod(newStart, newEnd);
        period.updatePeriod(newStart, newEnd);
        contractor.touch();

        log.info("Contractor period updated: period={} contractor={} board={} by user={}",
                periodId, contractorId, boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    @Transactional
    public BoardContractorResponse.Detail deletePeriod(String boardId, String contractorId, String periodId,
                                                       String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardContractor contractor = contractorRepository.findByIdAndBoardId(contractorId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        BoardMember requester = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));
        ensureCanManage(contractor, requester);

        BoardContractorPeriod period = periodRepository.findByIdAndContractorId(periodId, contractorId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        contractor.removePeriod(period);
        contractorRepository.saveAndFlush(contractor);

        log.info("Contractor period deleted: period={} contractor={} board={} by user={}",
                periodId, contractorId, boardId, userId);

        broadcastUpdate(boardId, userId);
        return BoardContractorResponse.Detail.of(contractor);
    }

    private void validatePeriod(LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    @Transactional
    public BoardContractorResponse.ListResponse reorder(String boardId, String userId,
                                                        BoardContractorRequest.Reorder request) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<BoardContractor> contractors = contractorRepository.findAllByBoardIdOrdered(boardId);
        Map<String, BoardContractor> byId = new HashMap<>();
        for (BoardContractor c : contractors) byId.put(c.getId(), c);

        List<String> ids = request.getIds();
        for (int i = 0; i < ids.size(); i++) {
            BoardContractor c = byId.get(ids.get(i));
            if (c != null) {
                c.updateDisplayOrder(i + 1);
            }
        }

        log.info("Contractors reordered for board: {} by user: {}", boardId, userId);

        broadcastUpdate(boardId, userId);
        return list(boardId, userId);
    }

    private void ensureCanManage(BoardContractor contractor, BoardMember requester) {
        if (requester.isAdminOrAbove()) return;
        if (contractor.getManager() != null
                && contractor.getManager().getId().equals(requester.getId())) return;
        throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
    }

    private void broadcastUpdate(String boardId, String userId) {
        try {
            User user = userRepository.findById(userId).orElse(null);
            webSocketEventService.sendBoardEvent(
                    boardId,
                    BoardEventType.CONTRACTOR_UPDATED,
                    userId,
                    user != null ? user.getName() : null,
                    null
            );
        } catch (Exception e) {
            log.warn("Failed to broadcast CONTRACTOR_UPDATED for board {}: {}", boardId, e.getMessage());
        }
    }
}
