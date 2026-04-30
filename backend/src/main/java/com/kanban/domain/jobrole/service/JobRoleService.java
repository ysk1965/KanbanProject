package com.kanban.domain.jobrole.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.jobrole.dto.JobRoleRequest;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobRoleService {

    private final JobRoleRepository jobRoleRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardService boardService;
    private final UserRepository userRepository;
    private final WebSocketEventService webSocketEventService;

    public JobRoleResponse.ListResponse list(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<JobRole> roles = jobRoleRepository.findAllByBoardIdOrdered(boardId);
        Map<String, Long> counts = loadMemberCounts(boardId);

        List<JobRoleResponse.Detail> details = roles.stream()
                .map(r -> JobRoleResponse.Detail.of(r, counts.getOrDefault(r.getId(), 0L)))
                .toList();

        return JobRoleResponse.ListResponse.of(details);
    }

    @Transactional
    public JobRoleResponse.Detail create(String boardId, String userId, JobRoleRequest.Create request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (jobRoleRepository.existsByBoardIdAndName(boardId, request.getName())) {
            throw new BusinessException(ErrorCode.JOB_ROLE_ALREADY_EXISTS);
        }

        Integer nextOrder = jobRoleRepository.findAllByBoardIdOrdered(boardId).size() + 1;

        JobRole role = JobRole.builder()
                .board(board)
                .name(request.getName())
                .color(request.getColor())
                .icon(request.getIcon())
                .displayOrder(nextOrder)
                .build();

        jobRoleRepository.save(role);

        log.info("JobRole created: {} in board: {} by user: {}", role.getId(), boardId, userId);

        broadcastUpdate(boardId, userId);
        return JobRoleResponse.Detail.of(role, 0L);
    }

    @Transactional
    public JobRoleResponse.Detail update(String boardId, String roleId, String userId, JobRoleRequest.Update request) {
        boardService.checkAdminOrAbove(boardId, userId);

        JobRole role = jobRoleRepository.findByIdAndBoardId(roleId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOB_ROLE_NOT_FOUND));

        if (request.getName() != null && !request.getName().equals(role.getName())) {
            if (jobRoleRepository.existsByBoardIdAndName(boardId, request.getName())) {
                throw new BusinessException(ErrorCode.JOB_ROLE_ALREADY_EXISTS);
            }
        }

        role.updateInfo(request.getName(), request.getColor(), request.getIcon());

        log.info("JobRole updated: {} in board: {} by user: {}", roleId, boardId, userId);

        broadcastUpdate(boardId, userId);
        Long memberCount = loadMemberCounts(boardId).getOrDefault(roleId, 0L);
        return JobRoleResponse.Detail.of(role, memberCount);
    }

    @Transactional
    public void delete(String boardId, String roleId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        JobRole role = jobRoleRepository.findByIdAndBoardId(roleId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOB_ROLE_NOT_FOUND));

        // 멤버에 부여된 직군 해제 (FK ON DELETE SET NULL이지만 영속성 컨텍스트 동기화)
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        for (BoardMember m : members) {
            if (m.getJobRole() != null && roleId.equals(m.getJobRole().getId())) {
                m.updateJobRole(null);
            }
        }

        jobRoleRepository.delete(role);

        log.info("JobRole deleted: {} in board: {} by user: {}", roleId, boardId, userId);

        broadcastUpdate(boardId, userId);
    }

    @Transactional
    public JobRoleResponse.ListResponse reorder(String boardId, String userId, JobRoleRequest.Reorder request) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<JobRole> roles = jobRoleRepository.findAllByBoardIdOrdered(boardId);
        Map<String, JobRole> roleMap = new HashMap<>();
        for (JobRole r : roles) roleMap.put(r.getId(), r);

        List<String> ids = request.getIds();
        for (int i = 0; i < ids.size(); i++) {
            JobRole r = roleMap.get(ids.get(i));
            if (r != null) {
                r.updateDisplayOrder(i + 1);
            }
        }

        log.info("JobRoles reordered for board: {} by user: {}", boardId, userId);

        broadcastUpdate(boardId, userId);
        return list(boardId, userId);
    }

    private Map<String, Long> loadMemberCounts(String boardId) {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : jobRoleRepository.countMembersByJobRole(boardId)) {
            counts.put((String) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    private void broadcastUpdate(String boardId, String userId) {
        try {
            User user = userRepository.findById(userId).orElse(null);
            webSocketEventService.sendBoardEvent(
                    boardId,
                    BoardEventType.JOB_ROLE_UPDATED,
                    userId,
                    user != null ? user.getName() : null,
                    null
            );
        } catch (Exception e) {
            log.warn("Failed to broadcast JOB_ROLE_UPDATED for board {}: {}", boardId, e.getMessage());
        }
    }
}
