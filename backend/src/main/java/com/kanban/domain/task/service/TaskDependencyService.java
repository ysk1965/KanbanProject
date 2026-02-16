package com.kanban.domain.task.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskDependency;
import com.kanban.domain.task.TaskDependencyRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskDependencyDto;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TaskDependencyService {

    private final TaskDependencyRepository taskDependencyRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;

    public List<TaskDependencyDto.Response> getDependencies(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<TaskDependency> dependencies = taskDependencyRepository.findByBoardIdWithFetch(boardId);
        return dependencies.stream()
                .map(TaskDependencyDto.Response::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public TaskDependencyDto.Response createDependency(String boardId, String userId,
                                                        TaskDependencyDto.CreateRequest request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 같은 태스크끼리의 의존성 검증
        if (request.predecessorId().equals(request.successorId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "같은 Task 간에는 의존성을 생성할 수 없습니다");
        }

        Task predecessor = taskRepository.findById(request.predecessorId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND, "선행 Task를 찾을 수 없습니다"));

        Task successor = taskRepository.findById(request.successorId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND, "후행 Task를 찾을 수 없습니다"));

        // 이미 존재하는 의존성인지 확인
        taskDependencyRepository.findByPredecessorIdAndSuccessorId(
                request.predecessorId(), request.successorId()
        ).ifPresent(dep -> {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "이미 존재하는 의존성입니다");
        });

        // 순환 의존성 검증
        validateNoCycle(request.successorId(), request.predecessorId());

        TaskDependency dependency = TaskDependency.create(board, predecessor, successor);
        taskDependencyRepository.save(dependency);

        log.info("Task dependency created: {} -> {} in board {}", request.predecessorId(), request.successorId(), boardId);

        return TaskDependencyDto.Response.from(dependency);
    }

    @Transactional
    public void deleteDependency(String boardId, String userId, String dependencyId) {
        boardService.checkMemberOrAbove(boardId, userId);

        TaskDependency dependency = taskDependencyRepository.findById(dependencyId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "의존성을 찾을 수 없습니다"));

        // 해당 보드의 의존성인지 확인
        if (!dependency.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        taskDependencyRepository.delete(dependency);

        log.info("Task dependency deleted: {} in board {}", dependencyId, boardId);
    }

    /**
     * BFS로 순환 의존성을 검증합니다.
     * successor에서 시작하여 predecessor에 도달할 수 있으면 순환이 존재합니다.
     */
    private void validateNoCycle(String successorId, String predecessorId) {
        Set<String> visited = new HashSet<>();
        Queue<String> queue = new LinkedList<>();
        queue.add(successorId);

        while (!queue.isEmpty()) {
            String current = queue.poll();
            if (current.equals(predecessorId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "순환 의존성이 감지되었습니다");
            }
            if (visited.add(current)) {
                List<TaskDependency> deps = taskDependencyRepository.findByPredecessorId(current);
                deps.forEach(d -> queue.add(d.getSuccessor().getId()));
            }
        }
    }
}
