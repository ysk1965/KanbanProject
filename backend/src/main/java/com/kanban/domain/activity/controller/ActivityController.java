package com.kanban.domain.activity.controller;

import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.dto.ActivityResponse;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/activities")
@RequiredArgsConstructor
public class ActivityController {

    private final ActivityService activityService;

    @GetMapping
    public ResponseEntity<ActivityResponse.ListResponse> getActivities(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime cursor,
            @RequestParam(defaultValue = "20") int limit) {
        ActivityResponse.ListResponse response = activityService.getActivities(boardId, principal.getUserId(), cursor, limit);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/target/{targetType}/{targetId}")
    public ResponseEntity<List<ActivityResponse.Detail>> getTargetActivities(
            @PathVariable String boardId,
            @PathVariable TargetType targetType,
            @PathVariable String targetId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<ActivityResponse.Detail> response = activityService.getTargetActivities(boardId, principal.getUserId(), targetType, targetId);
        return ResponseEntity.ok(response);
    }
}
