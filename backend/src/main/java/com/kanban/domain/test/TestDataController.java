package com.kanban.domain.test;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
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

    /**
     * 테스트 데이터 생성은 시스템 관리자 전용이다. (FE 대시보드의 isAdmin 게이트와 동일한 서버 측 강제)
     */
    private void verifyAdminAccess(UserPrincipal principal) {
        if (principal == null || !principal.isAdmin()) {
            throw new BusinessException(ErrorCode.ADMIN_ACCESS_DENIED);
        }
    }

    @PostMapping("/create-board")
    public ResponseEntity<TestDataResponse> createTestBoard(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        TestDataResponse response = testDataService.createTestBoard(principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/create-organization")
    public ResponseEntity<TestOrgDataResponse> createTestOrganization(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        TestOrgDataResponse response = testDataService.createTestOrganization(principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
