package com.kanban.domain.weight.controller;

import com.kanban.domain.weight.dto.WeightRequest;
import com.kanban.domain.weight.dto.WeightResponse;
import com.kanban.domain.weight.service.WeightLevelService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/boards/{boardId}")
@RequiredArgsConstructor
public class WeightLevelController {

    private final WeightLevelService weightLevelService;

    @GetMapping("/weight-levels")
    public ResponseEntity<WeightResponse.BoardWeightSettings> getWeightLevels(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        log.info("Getting weight levels for board: {}", boardId);
        WeightResponse.BoardWeightSettings response = weightLevelService.getWeightLevels(
                boardId, principal.getUserId()
        );
        return ResponseEntity.ok(response);
    }

    @PutMapping("/weight-levels")
    public ResponseEntity<WeightResponse.BoardWeightSettings> updateWeightLevels(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody WeightRequest.UpdateLevels request
    ) {
        log.info("Updating weight levels for board: {}", boardId);
        WeightResponse.BoardWeightSettings response = weightLevelService.updateWeightLevels(
                boardId, principal.getUserId(), request
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/tasks/{taskId}/weight")
    public ResponseEntity<WeightResponse.TaskWeightDetail> setTaskWeight(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody WeightRequest.SetTaskWeight request
    ) {
        log.info("Setting weight for task: {} in board: {}", taskId, boardId);
        WeightResponse.TaskWeightDetail response = weightLevelService.setTaskWeight(
                boardId, taskId, principal.getUserId(), request.getWeight_level_id()
        );
        return ResponseEntity.ok(response);
    }

    @GetMapping("/tasks/{taskId}/weight")
    public ResponseEntity<WeightResponse.TaskWeightDetail> getTaskWeight(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        log.info("Getting weight for task: {} in board: {}", taskId, boardId);
        WeightResponse.TaskWeightDetail response = weightLevelService.getTaskWeight(
                boardId, taskId, principal.getUserId()
        );
        return ResponseEntity.ok(response);
    }
}
