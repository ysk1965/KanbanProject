package com.kanban.domain.standup.controller;

import com.kanban.domain.standup.dto.StandupConfigRequest;
import com.kanban.domain.standup.dto.StandupConfigResponse;
import com.kanban.domain.standup.service.DailyStandupService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/standup-config")
@RequiredArgsConstructor
public class DailyStandupController {

    private final DailyStandupService dailyStandupService;

    @GetMapping
    public ResponseEntity<StandupConfigResponse.Detail> getConfig(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        StandupConfigResponse.Detail response =
                dailyStandupService.getConfig(boardId, principal.getUserId());
        if (response == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(response);
    }

    @PutMapping
    public ResponseEntity<StandupConfigResponse.Detail> upsertConfig(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StandupConfigRequest.Upsert request) {
        return ResponseEntity.ok(
                dailyStandupService.upsertConfig(boardId, principal.getUserId(), request));
    }
}
