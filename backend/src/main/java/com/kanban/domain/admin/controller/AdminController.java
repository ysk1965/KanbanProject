package com.kanban.domain.admin.controller;

import com.kanban.domain.admin.dto.AdminRequest;
import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.admin.service.AdminService;
import com.kanban.domain.board.BoardTier;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;

    /**
     * Admin 권한 검증
     */
    private void verifyAdminAccess(UserPrincipal principal) {
        if (principal == null || !principal.isAdmin()) {
            throw new BusinessException(ErrorCode.ADMIN_ACCESS_DENIED);
        }
    }

    // ==================== Users ====================

    @GetMapping("/users")
    public ResponseEntity<AdminResponse.UserList> getUsers(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getUsers(page, size, search));
    }

    @GetMapping("/users/{userId}")
    public ResponseEntity<AdminResponse.UserDetail> getUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getUser(userId));
    }

    @PatchMapping("/users/{userId}")
    public ResponseEntity<AdminResponse.UserSummary> updateUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @Valid @RequestBody AdminRequest.UpdateUser request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateUser(userId, request));
    }

    @GetMapping("/users/{userId}/boards")
    public ResponseEntity<AdminResponse.BoardList> getUserBoards(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getUserBoards(userId));
    }

    // ==================== Boards ====================

    @GetMapping("/boards")
    public ResponseEntity<AdminResponse.BoardList> getBoards(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BoardTier tier) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getBoards(page, size, search, tier));
    }

    @GetMapping("/boards/{boardId}")
    public ResponseEntity<AdminResponse.BoardDetail> getBoard(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getBoard(boardId));
    }

    @DeleteMapping("/boards/{boardId}")
    public ResponseEntity<Map<String, String>> deleteBoard(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId) {
        verifyAdminAccess(principal);
        adminService.deleteBoard(boardId);
        return ResponseEntity.ok(Map.of("message", "보드가 삭제되었습니다"));
    }

    @PatchMapping("/boards/{boardId}/tier")
    public ResponseEntity<AdminResponse.BoardSummary> updateBoardTier(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.UpdateBoardTier request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateBoardTier(boardId, request));
    }

    // ==================== Statistics ====================

    @GetMapping("/statistics")
    public ResponseEntity<AdminResponse.Statistics> getStatistics(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getStatistics());
    }

    // ==================== Subscriptions ====================

    @GetMapping("/subscriptions")
    public ResponseEntity<AdminResponse.SubscriptionList> getSubscriptions(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getSubscriptions(page, size));
    }
}
