package com.kanban.domain.notification.controller;

import com.kanban.domain.notification.service.DeviceTokenService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/device-tokens")
@RequiredArgsConstructor
public class DeviceTokenController {

    private final DeviceTokenService deviceTokenService;

    @PostMapping
    public ResponseEntity<Map<String, String>> register(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> request) {
        deviceTokenService.registerToken(
                principal.getUserId(),
                request.get("token"),
                request.get("platform"),
                request.get("device_info")
        );
        return ResponseEntity.ok(Map.of("message", "Token registered"));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, String>> unregister(
            @RequestBody Map<String, String> request) {
        deviceTokenService.unregisterToken(request.get("token"));
        return ResponseEntity.ok(Map.of("message", "Token unregistered"));
    }
}
