package com.kanban.domain.test;

import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/test")
@RequiredArgsConstructor
public class TestDataController {

    private final TestDataService testDataService;

    @PostMapping("/create-board")
    public ResponseEntity<TestDataResponse> createTestBoard(
            @AuthenticationPrincipal UserPrincipal principal) {
        TestDataResponse response = testDataService.createTestBoard(principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
