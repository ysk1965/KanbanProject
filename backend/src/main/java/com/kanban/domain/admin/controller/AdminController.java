package com.kanban.domain.admin.controller;

import com.kanban.domain.admin.dto.AdminRequest;
import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.admin.service.AdminService;
import com.kanban.domain.announcement.AnnouncementType;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.BoardType;
import com.kanban.domain.inquiry.InquiryStatus;
import com.kanban.domain.inquiry.dto.InquiryRequest;
import com.kanban.domain.inquiry.dto.InquiryResponse;
import com.kanban.domain.inquiry.service.InquiryService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final InquiryService inquiryService;

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
        return ResponseEntity.ok(adminService.updateUser(userId, request, principal.getUserId()));
    }

    @GetMapping("/users/{userId}/boards")
    public ResponseEntity<AdminResponse.BoardList> getUserBoards(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getUserBoards(userId));
    }

    @PostMapping("/users/{userId}/deactivate")
    public ResponseEntity<AdminResponse.UserSummary> deactivateUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @RequestBody(required = false) AdminRequest.DeactivateUser request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.deactivateUser(userId, request));
    }

    @PostMapping("/users/{userId}/activate")
    public ResponseEntity<AdminResponse.UserSummary> activateUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.activateUser(userId));
    }

    @PostMapping("/users/{userId}/verify-email")
    public ResponseEntity<AdminResponse.UserSummary> verifyUserEmail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.verifyUserEmailByAdmin(userId));
    }

    @PostMapping("/users/{userId}/send-password-reset")
    public ResponseEntity<Map<String, String>> sendPasswordResetEmail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        adminService.sendPasswordResetEmailByAdmin(userId);
        return ResponseEntity.ok(Map.of("message", "비밀번호 재설정 메일이 발송되었습니다"));
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Map<String, String>> deleteUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId) {
        verifyAdminAccess(principal);
        adminService.deleteUserByAdmin(userId);
        return ResponseEntity.ok(Map.of("message", "사용자가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/users/{userId}/boards/{boardId}")
    public ResponseEntity<Map<String, String>> removeUserFromBoard(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @PathVariable String boardId) {
        verifyAdminAccess(principal);
        adminService.removeUserFromBoard(userId, boardId);
        return ResponseEntity.ok(Map.of("message", "사용자가 보드에서 제거되었습니다"));
    }

    // ==================== Boards ====================

    @GetMapping("/boards")
    public ResponseEntity<AdminResponse.BoardList> getBoards(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BoardTier tier,
            @RequestParam(name = "board_type", required = false) BoardType boardType) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getBoards(page, size, search, tier, boardType));
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

    @PostMapping("/boards/{boardId}/transfer-ownership")
    public ResponseEntity<AdminResponse.BoardDetail> transferBoardOwnership(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.TransferOwnership request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.transferBoardOwnership(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/extend-trial")
    public ResponseEntity<AdminResponse.BoardSummary> extendTrial(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.ExtendTrial request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.extendTrial(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/members/{memberId}/role")
    public ResponseEntity<AdminResponse.BoardDetail> updateMemberRole(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @PathVariable String memberId,
            @Valid @RequestBody AdminRequest.UpdateMemberRole request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateMemberRole(boardId, memberId, request));
    }

    @PatchMapping("/boards/{boardId}/name")
    public ResponseEntity<AdminResponse.BoardDetail> updateBoardName(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.UpdateBoardName request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateBoardName(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/ai-credits")
    public ResponseEntity<AdminResponse.BoardDetail> adjustAiCredits(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.AdjustAiCredits request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.adjustAiCredits(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/seat-count")
    public ResponseEntity<AdminResponse.BoardDetail> updateSeatCount(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String boardId,
            @Valid @RequestBody AdminRequest.UpdateSeatCount request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateSeatCount(boardId, request));
    }

    // ==================== Statistics ====================

    @GetMapping("/statistics")
    public ResponseEntity<AdminResponse.Statistics> getStatistics(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getStatistics());
    }

    // ==================== Analytics ====================

    @GetMapping("/statistics/signups")
    public ResponseEntity<AdminResponse.SignupTrend> getSignupTrend(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getSignupTrend(days));
    }

    @GetMapping("/statistics/active-users")
    public ResponseEntity<AdminResponse.ActiveUserStats> getActiveUserStats(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getActiveUserStats(days));
    }

    @GetMapping("/statistics/conversion")
    public ResponseEntity<AdminResponse.ConversionStats> getConversionStats(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "365") @Min(1) @Max(730) int days) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getConversionStats(days));
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

    // ==================== Announcements ====================

    @GetMapping("/announcements")
    public ResponseEntity<List<AdminResponse.AnnouncementDetail>> getAnnouncements(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getAllAnnouncements());
    }

    @PostMapping("/announcements")
    public ResponseEntity<AdminResponse.AnnouncementDetail> createAnnouncement(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AdminRequest.CreateAnnouncement request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.createAnnouncement(request));
    }

    @PutMapping("/announcements/{id}")
    public ResponseEntity<AdminResponse.AnnouncementDetail> updateAnnouncement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id,
            @Valid @RequestBody AdminRequest.CreateAnnouncement request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.updateAnnouncement(id, request));
    }

    @DeleteMapping("/announcements/{id}")
    public ResponseEntity<Map<String, String>> deleteAnnouncement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id) {
        verifyAdminAccess(principal);
        adminService.deleteAnnouncement(id);
        return ResponseEntity.ok(Map.of("message", "공지사항이 삭제되었습니다"));
    }

    // ==================== System (Maintenance) ====================

    @GetMapping("/system/maintenance")
    public ResponseEntity<AdminResponse.MaintenanceStatus> getMaintenanceStatus(
            @AuthenticationPrincipal UserPrincipal principal) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.getMaintenanceStatus());
    }

    @PostMapping("/system/maintenance")
    public ResponseEntity<AdminResponse.MaintenanceStatus> setMaintenanceMode(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AdminRequest.SetMaintenance request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(adminService.setMaintenanceMode(request));
    }

    // ==================== Inquiries ====================

    @GetMapping("/inquiries")
    public ResponseEntity<InquiryResponse.InquiryList> getInquiries(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) InquiryStatus status) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(inquiryService.getInquiries(page, size, status));
    }

    @GetMapping("/inquiries/{inquiryId}")
    public ResponseEntity<InquiryResponse.Detail> getInquiryDetail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(inquiryService.getInquiryForAdmin(inquiryId));
    }

    @PostMapping("/inquiries/{inquiryId}/reply")
    public ResponseEntity<InquiryResponse.ReplyDetail> replyToInquiry(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId,
            @Valid @RequestBody InquiryRequest.Reply request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(inquiryService.replyToInquiry(inquiryId, principal.getUserId(), request));
    }

    @PatchMapping("/inquiries/{inquiryId}/status")
    public ResponseEntity<InquiryResponse.Detail> updateInquiryStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId,
            @Valid @RequestBody InquiryRequest.UpdateStatus request) {
        verifyAdminAccess(principal);
        return ResponseEntity.ok(inquiryService.updateInquiryStatus(inquiryId, request));
    }
}
