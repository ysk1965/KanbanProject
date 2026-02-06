package com.kanban.domain.notification.controller;

import com.kanban.domain.notification.dto.NotificationPreferenceRequest;
import com.kanban.domain.notification.dto.NotificationPreferenceResponse;
import com.kanban.domain.notification.service.NotificationPreferenceService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/notification-preferences/me")
@RequiredArgsConstructor
public class NotificationPreferenceController {

    private final NotificationPreferenceService preferenceService;

    @GetMapping
    public ResponseEntity<NotificationPreferenceResponse.Detail> getMyPreferences(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NotificationPreferenceResponse.Detail response =
                preferenceService.getMyPreferences(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping
    public ResponseEntity<NotificationPreferenceResponse.Detail> upsertMyPreferences(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody NotificationPreferenceRequest.Update request) {
        NotificationPreferenceResponse.Detail response =
                preferenceService.upsertMyPreferences(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
