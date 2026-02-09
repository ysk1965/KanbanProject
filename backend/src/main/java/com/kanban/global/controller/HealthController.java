package com.kanban.global.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @Value("${app.version.commit:unknown}")
    private String commit;

    @Value("${app.version.build-time:unknown}")
    private String buildTime;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "healthy",
                "commit", commit,
                "buildTime", buildTime
        ));
    }
}
