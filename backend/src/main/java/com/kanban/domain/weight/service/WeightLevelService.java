package com.kanban.domain.weight.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.weight.TaskWeight;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.domain.weight.WeightLevel;
import com.kanban.domain.weight.WeightLevelRepository;
import com.kanban.domain.weight.dto.WeightRequest;
import com.kanban.domain.weight.dto.WeightResponse;
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
public class WeightLevelService {

    private final WeightLevelRepository weightLevelRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final BoardRepository boardRepository;
    private final TaskRepository taskRepository;

    @Transactional(readOnly = true)
    public WeightResponse.BoardWeightSettings getWeightLevels(String boardId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<WeightLevel> levels = weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);

        // 가중치 레벨이 없으면 기본 레벨 생성
        if (levels.isEmpty()) {
            WeightLevel defaultLevel = createDefaultLevel(board);
            levels = Collections.singletonList(defaultLevel);
        }

        String defaultLevelId = levels.stream()
                .filter(WeightLevel::getIsDefault)
                .findFirst()
                .map(WeightLevel::getId)
                .orElse(levels.get(0).getId());

        return WeightResponse.BoardWeightSettings.from(boardId, levels, defaultLevelId);
    }

    @Transactional
    public WeightResponse.BoardWeightSettings updateWeightLevels(
            String boardId,
            String userId,
            WeightRequest.UpdateLevels request
    ) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<WeightLevel> existingLevels = weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);
        Map<String, WeightLevel> existingMap = existingLevels.stream()
                .collect(Collectors.toMap(WeightLevel::getId, l -> l));

        Set<String> incomingIds = new HashSet<>();
        List<WeightLevel> updatedLevels = new ArrayList<>();

        // 업데이트 또는 생성
        for (WeightRequest.LevelData levelData : request.getLevels()) {
            if (levelData.getId() != null && existingMap.containsKey(levelData.getId())) {
                // 기존 레벨 업데이트
                WeightLevel existing = existingMap.get(levelData.getId());
                existing.update(
                        levelData.getName(),
                        levelData.getWeight(),
                        levelData.getColor(),
                        levelData.getPosition()
                );
                existing.setAsDefault(levelData.getId().equals(request.getDefault_level_id()));
                updatedLevels.add(existing);
                incomingIds.add(levelData.getId());
            } else {
                // 새 레벨 생성
                WeightLevel newLevel = WeightLevel.builder()
                        .board(board)
                        .name(levelData.getName())
                        .weight(levelData.getWeight())
                        .color(levelData.getColor())
                        .position(levelData.getPosition())
                        .isDefault(false)
                        .build();
                weightLevelRepository.save(newLevel);
                if (request.getDefault_level_id() != null &&
                        levelData.getId() != null &&
                        levelData.getId().equals(request.getDefault_level_id())) {
                    newLevel.setAsDefault(true);
                }
                updatedLevels.add(newLevel);
            }
        }

        // 삭제된 레벨 처리
        for (WeightLevel existing : existingLevels) {
            if (!incomingIds.contains(existing.getId())) {
                // 해당 레벨을 사용하는 TaskWeight 삭제
                taskWeightRepository.deleteByWeightLevelId(existing.getId());
                weightLevelRepository.delete(existing);
            }
        }

        // 기본 레벨 설정
        if (request.getDefault_level_id() != null) {
            for (WeightLevel level : updatedLevels) {
                level.setAsDefault(level.getId().equals(request.getDefault_level_id()));
            }
        } else if (!updatedLevels.isEmpty()) {
            // 기본 레벨이 없으면 첫 번째를 기본으로
            boolean hasDefault = updatedLevels.stream().anyMatch(WeightLevel::getIsDefault);
            if (!hasDefault) {
                updatedLevels.get(0).setAsDefault(true);
            }
        }

        weightLevelRepository.saveAll(updatedLevels);

        // 결과 조회
        List<WeightLevel> finalLevels = weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);
        String defaultLevelId = finalLevels.stream()
                .filter(WeightLevel::getIsDefault)
                .findFirst()
                .map(WeightLevel::getId)
                .orElse(finalLevels.isEmpty() ? null : finalLevels.get(0).getId());

        return WeightResponse.BoardWeightSettings.from(boardId, finalLevels, defaultLevelId);
    }

    @Transactional
    public WeightResponse.TaskWeightDetail setTaskWeight(
            String boardId,
            String taskId,
            String userId,
            String weightLevelId
    ) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        WeightLevel weightLevel = weightLevelRepository.findById(weightLevelId)
                .orElseThrow(() -> new BusinessException(ErrorCode.WEIGHT_LEVEL_NOT_FOUND));

        if (!weightLevel.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.WEIGHT_LEVEL_NOT_FOUND);
        }

        Optional<TaskWeight> existingOpt = taskWeightRepository.findByTaskId(taskId);

        TaskWeight taskWeight;
        if (existingOpt.isPresent()) {
            taskWeight = existingOpt.get();
            taskWeight.updateWeightLevel(weightLevel);
        } else {
            taskWeight = TaskWeight.create(task, weightLevel);
        }

        taskWeightRepository.save(taskWeight);

        return WeightResponse.TaskWeightDetail.from(taskWeight);
    }

    @Transactional(readOnly = true)
    public WeightResponse.TaskWeightDetail getTaskWeight(String boardId, String taskId, String userId) {
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Optional<TaskWeight> taskWeightOpt = taskWeightRepository.findByTaskId(taskId);

        if (taskWeightOpt.isPresent()) {
            return WeightResponse.TaskWeightDetail.from(taskWeightOpt.get());
        }

        // 기본 가중치 반환
        return WeightResponse.TaskWeightDetail.defaultFor(taskId);
    }

    @Transactional
    public WeightLevel createDefaultLevel(Board board) {
        WeightLevel defaultLevel = WeightLevel.builder()
                .board(board)
                .name("Standard")
                .weight(1.0)
                .color("#6366f1")
                .position(0)
                .isDefault(true)
                .build();
        return weightLevelRepository.save(defaultLevel);
    }

    @Transactional(readOnly = true)
    public List<WeightLevel> getWeightLevelsByBoardId(String boardId) {
        return weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);
    }

    @Transactional(readOnly = true)
    public Map<String, TaskWeight> getTaskWeightMapByBoardId(String boardId) {
        List<TaskWeight> taskWeights = taskWeightRepository.findByBoardId(boardId);
        return taskWeights.stream()
                .collect(Collectors.toMap(tw -> tw.getTask().getId(), tw -> tw));
    }
}
