package com.kanban.domain.task.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.dto.TaskResponse.AssigneeInfo;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TaskMoveService {

    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final BlockRepository blockRepository;
    private final FeatureRepository featureRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    /**
     * Task를 다른 보드로 이동
     * - 소스/타겟 보드 모두 멤버 권한 필요
     * - 타겟 보드의 첫 번째 Feature에 배정
     * - 체크리스트 함께 이동
     */
    @Transactional
    public TaskResponse.Simple moveTaskToBoard(String taskId, String userId, TaskRequest.MoveToBoard request) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        String sourceBoardId = task.getBoard().getId();

        // 소스 보드 권한 확인
        boardService.checkMemberOrAbove(sourceBoardId, userId);

        // 타겟 보드 권한 확인
        boardService.checkMemberOrAbove(request.getTargetBoardId(), userId);

        Board targetBoard = boardRepository.findById(request.getTargetBoardId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Block targetBlock = blockRepository.findById(request.getTargetBlockId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // 타겟 블록이 타겟 보드에 속하는지 확인
        if (!targetBlock.getBoard().getId().equals(targetBoard.getId())) {
            throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
        }

        // 타겟 보드의 첫 번째 Feature 가져오기 (없으면 생성)
        Feature targetFeature = getOrCreateDefaultFeature(targetBoard);

        // 소스 Feature 카운터 감소
        Feature sourceFeature = task.getFeature();
        sourceFeature.decrementTotalTasks();
        if (Boolean.TRUE.equals(task.getIsCompleted())) {
            sourceFeature.decrementCompletedTasks();
        }

        // 새 position 계산
        Integer maxPos = taskRepository.findMaxPositionByBlockId(targetBlock.getId());
        int newPosition = (maxPos != null) ? maxPos + 1 : 0;

        // Task 이동
        task.moveToBoard(targetBoard, targetBlock, targetFeature, newPosition);

        // 타겟 Feature 카운터 증가
        targetFeature.incrementTotalTasks();
        if (Boolean.TRUE.equals(task.getIsCompleted())) {
            targetFeature.incrementCompletedTasks();
        }

        taskRepository.save(task);

        return TaskResponse.Simple.of(task, Collections.emptyList(), 0, 0, Collections.emptyList());
    }

    /**
     * Task를 다른 보드로 복사
     * - 소스 Task 유지, 새 Task 생성
     * - 체크리스트 복사
     */
    @Transactional
    public TaskResponse.Simple copyTaskToBoard(String taskId, String userId, TaskRequest.CopyToBoard request) {
        Task sourceTask = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        // 소스 보드 권한 확인
        boardService.checkMemberOrAbove(sourceTask.getBoard().getId(), userId);

        // 타겟 보드 권한 확인
        boardService.checkMemberOrAbove(request.getTargetBoardId(), userId);

        Board targetBoard = boardRepository.findById(request.getTargetBoardId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Block targetBlock = blockRepository.findById(request.getTargetBlockId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        if (!targetBlock.getBoard().getId().equals(targetBoard.getId())) {
            throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
        }

        Feature targetFeature = getOrCreateDefaultFeature(targetBoard);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 새 position
        Integer maxPos = taskRepository.findMaxPositionByBlockId(targetBlock.getId());
        int newPosition = (maxPos != null) ? maxPos + 1 : 0;

        // 새 Task 생성 (복사)
        Task newTask = Task.builder()
                .id(UUID.randomUUID().toString())
                .title(sourceTask.getTitle())
                .description(sourceTask.getDescription())
                .startDate(sourceTask.getStartDate())
                .dueDate(sourceTask.getDueDate())
                .estimatedMinutes(sourceTask.getEstimatedMinutes())
                .isCompleted(false)
                .position(newPosition)
                .board(targetBoard)
                .block(targetBlock)
                .feature(targetFeature)
                .createdBy(user)
                .build();

        taskRepository.save(newTask);

        // Feature 카운터 증가
        targetFeature.incrementTotalTasks();

        // 체크리스트 복사
        List<ChecklistItem> sourceItems = checklistItemRepository.findByTaskIdOrderByPositionAsc(sourceTask.getId());
        for (ChecklistItem item : sourceItems) {
            ChecklistItem newItem = ChecklistItem.builder()
                    .id(UUID.randomUUID().toString())
                    .task(newTask)
                    .title(item.getTitle())
                    .isCompleted(false)
                    .position(item.getPosition())
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .build();
            checklistItemRepository.save(newItem);
        }

        return TaskResponse.Simple.of(newTask, Collections.emptyList(), sourceItems.size(), 0, Collections.emptyList());
    }

    private Feature getOrCreateDefaultFeature(Board board) {
        List<Feature> features = featureRepository.findByBoardIdOrderByPositionAsc(board.getId());
        if (!features.isEmpty()) {
            return features.get(0);
        }

        // Default Feature 생성
        Feature feature = Feature.builder()
                .id(UUID.randomUUID().toString())
                .board(board)
                .title("General")
                .color("#6366F1")
                .position(0)
                .totalTasks(0)
                .completedTasks(0)
                .build();
        return featureRepository.save(feature);
    }
}
