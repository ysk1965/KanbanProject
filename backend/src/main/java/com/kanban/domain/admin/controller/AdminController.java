package com.kanban.domain.admin.controller;

import com.kanban.domain.admin.dto.AdminRequest;
import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.admin.service.AdminService;
import com.kanban.domain.admin.service.AiKeyAdminService;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.BoardType;
import com.kanban.domain.inquiry.InquiryStatus;
import com.kanban.domain.inquiry.dto.InquiryRequest;
import com.kanban.domain.inquiry.dto.InquiryResponse;
import com.kanban.domain.inquiry.service.InquiryService;
import com.kanban.domain.system.MonetizationService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@PreAuthorize("hasRole('ADMIN')")
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final InquiryService inquiryService;
    private final MonetizationService monetizationService;
    private final AiKeyAdminService aiKeyAdminService;

    // ==================== Users ====================

    @GetMapping("/users")
    public ResponseEntity<AdminResponse.UserList> getUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(adminService.getUsers(page, size, search));
    }

    @GetMapping("/users/{userId}")
    public ResponseEntity<AdminResponse.UserDetail> getUser(@PathVariable String userId) {
        return ResponseEntity.ok(adminService.getUser(userId));
    }

    @PatchMapping("/users/{userId}")
    public ResponseEntity<AdminResponse.UserSummary> updateUser(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String userId,
            @Valid @RequestBody AdminRequest.UpdateUser request) {
        return ResponseEntity.ok(adminService.updateUser(userId, request, principal.getUserId()));
    }

    @GetMapping("/users/{userId}/boards")
    public ResponseEntity<AdminResponse.BoardList> getUserBoards(@PathVariable String userId) {
        return ResponseEntity.ok(adminService.getUserBoards(userId));
    }

    @PostMapping("/users/{userId}/deactivate")
    public ResponseEntity<AdminResponse.UserSummary> deactivateUser(
            @PathVariable String userId, @RequestBody(required = false) AdminRequest.DeactivateUser request) {
        return ResponseEntity.ok(adminService.deactivateUser(userId, request));
    }

    @PostMapping("/users/{userId}/activate")
    public ResponseEntity<AdminResponse.UserSummary> activateUser(@PathVariable String userId) {
        return ResponseEntity.ok(adminService.activateUser(userId));
    }

    @PostMapping("/users/{userId}/verify-email")
    public ResponseEntity<AdminResponse.UserSummary> verifyUserEmail(@PathVariable String userId) {
        return ResponseEntity.ok(adminService.verifyUserEmailByAdmin(userId));
    }

    @PostMapping("/users/{userId}/send-password-reset")
    public ResponseEntity<Map<String, String>> sendPasswordResetEmail(@PathVariable String userId) {
        adminService.sendPasswordResetEmailByAdmin(userId);
        return ResponseEntity.ok(Map.of("message", "비밀번호 재설정 메일이 발송되었습니다"));
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Map<String, String>> deleteUser(@PathVariable String userId) {
        adminService.deleteUserByAdmin(userId);
        return ResponseEntity.ok(Map.of("message", "사용자가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/users/{userId}/boards/{boardId}")
    public ResponseEntity<Map<String, String>> removeUserFromBoard(
            @PathVariable String userId, @PathVariable String boardId) {
        adminService.removeUserFromBoard(userId, boardId);
        return ResponseEntity.ok(Map.of("message", "사용자가 보드에서 제거되었습니다"));
    }

    @PostMapping("/users/{userId}/create-personal-board")
    public ResponseEntity<Map<String, String>> createPersonalBoard(@PathVariable String userId) {
        adminService.createPersonalBoard(userId);
        return ResponseEntity.ok(Map.of("message", "개인 보드가 생성되었습니다"));
    }

    @PatchMapping("/users/{userId}/personal-ai-credits")
    public ResponseEntity<AdminResponse.UserDetail> adjustPersonalAiCredits(
            @PathVariable String userId, @Valid @RequestBody AdminRequest.AdjustPersonalAiCredits request) {
        return ResponseEntity.ok(adminService.adjustPersonalAiCredits(userId, request));
    }

    // ==================== Boards ====================

    @GetMapping("/boards")
    public ResponseEntity<AdminResponse.BoardList> getBoards(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BoardTier tier,
            @RequestParam(name = "board_type", required = false) BoardType boardType) {
        return ResponseEntity.ok(adminService.getBoards(page, size, search, tier, boardType));
    }

    @GetMapping("/boards/deleted")
    public ResponseEntity<AdminResponse.BoardList> getDeletedBoards(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(adminService.getDeletedBoards(page, size, search));
    }

    @GetMapping("/boards/{boardId}")
    public ResponseEntity<AdminResponse.BoardDetail> getBoard(@PathVariable String boardId) {
        return ResponseEntity.ok(adminService.getBoard(boardId));
    }

    @DeleteMapping("/boards/{boardId}")
    public ResponseEntity<Map<String, String>> deleteBoard(@PathVariable String boardId) {
        adminService.deleteBoard(boardId);
        return ResponseEntity.ok(Map.of("message", "보드가 삭제되었습니다. 7일 내 복구 가능합니다."));
    }

    @PostMapping("/boards/{boardId}/restore")
    public ResponseEntity<Map<String, String>> restoreBoard(@PathVariable String boardId) {
        adminService.restoreBoard(boardId);
        return ResponseEntity.ok(Map.of("message", "보드가 복구되었습니다"));
    }

    @DeleteMapping("/boards/{boardId}/permanent")
    public ResponseEntity<Map<String, String>> permanentlyDeleteBoard(@PathVariable String boardId) {
        adminService.permanentlyDeleteBoard(boardId);
        return ResponseEntity.ok(Map.of("message", "보드가 영구 삭제되었습니다"));
    }

    @PatchMapping("/boards/{boardId}/tier")
    public ResponseEntity<AdminResponse.BoardSummary> updateBoardTier(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.UpdateBoardTier request) {
        return ResponseEntity.ok(adminService.updateBoardTier(boardId, request));
    }

    @PostMapping("/boards/{boardId}/transfer-ownership")
    public ResponseEntity<AdminResponse.BoardDetail> transferBoardOwnership(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.TransferOwnership request) {
        return ResponseEntity.ok(adminService.transferBoardOwnership(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/extend-trial")
    public ResponseEntity<AdminResponse.BoardSummary> extendTrial(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.ExtendTrial request) {
        return ResponseEntity.ok(adminService.extendTrial(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/members/{memberId}/role")
    public ResponseEntity<AdminResponse.BoardDetail> updateMemberRole(
            @PathVariable String boardId,
            @PathVariable String memberId,
            @Valid @RequestBody AdminRequest.UpdateMemberRole request) {
        return ResponseEntity.ok(adminService.updateMemberRole(boardId, memberId, request));
    }

    @PatchMapping("/boards/{boardId}/name")
    public ResponseEntity<AdminResponse.BoardDetail> updateBoardName(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.UpdateBoardName request) {
        return ResponseEntity.ok(adminService.updateBoardName(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/ai-credits")
    public ResponseEntity<AdminResponse.BoardDetail> adjustAiCredits(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.AdjustAiCredits request) {
        return ResponseEntity.ok(adminService.adjustAiCredits(boardId, request));
    }

    @PatchMapping("/boards/{boardId}/seat-count")
    public ResponseEntity<AdminResponse.BoardDetail> updateSeatCount(
            @PathVariable String boardId, @Valid @RequestBody AdminRequest.UpdateSeatCount request) {
        return ResponseEntity.ok(adminService.updateSeatCount(boardId, request));
    }

    // ==================== Statistics ====================

    @GetMapping("/statistics")
    public ResponseEntity<AdminResponse.Statistics> getStatistics() {
        return ResponseEntity.ok(adminService.getStatistics());
    }

    // ==================== Analytics ====================

    @GetMapping("/statistics/signups")
    public ResponseEntity<AdminResponse.SignupTrend> getSignupTrend(
            @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        return ResponseEntity.ok(adminService.getSignupTrend(days));
    }

    @GetMapping("/statistics/active-users")
    public ResponseEntity<AdminResponse.ActiveUserStats> getActiveUserStats(
            @RequestParam(defaultValue = "30") @Min(1) @Max(365) int days) {
        return ResponseEntity.ok(adminService.getActiveUserStats(days));
    }

    @GetMapping("/statistics/conversion")
    public ResponseEntity<AdminResponse.ConversionStats> getConversionStats(
            @RequestParam(defaultValue = "365") @Min(1) @Max(730) int days) {
        return ResponseEntity.ok(adminService.getConversionStats(days));
    }

    @GetMapping("/statistics/personal-conversion")
    public ResponseEntity<AdminResponse.PersonalConversionStats> getPersonalConversionStats(
            @RequestParam(defaultValue = "365") @Min(1) @Max(730) int days) {
        return ResponseEntity.ok(adminService.getPersonalConversionStats(days));
    }

    // ==================== Churn Analysis ====================

    @GetMapping("/statistics/churn/retention")
    public ResponseEntity<AdminResponse.RetentionAnalysis> getRetentionAnalysis(
            @RequestParam(defaultValue = "8") @Min(4) @Max(24) int weeks) {
        return ResponseEntity.ok(adminService.getRetentionAnalysis(weeks));
    }

    @GetMapping("/statistics/churn/inactive-users")
    public ResponseEntity<AdminResponse.InactiveUserList> getInactiveUsers(
            @RequestParam(name = "inactive_days", defaultValue = "14") @Min(1) @Max(365) int inactiveDays,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(adminService.getInactiveUsers(inactiveDays, page, size));
    }

    @GetMapping("/statistics/churn/trial-dropout")
    public ResponseEntity<AdminResponse.TrialDropoutAnalysis> getTrialDropoutAnalysis(
            @RequestParam(defaultValue = "90") @Min(1) @Max(365) int days) {
        return ResponseEntity.ok(adminService.getTrialDropoutAnalysis(days));
    }

    @GetMapping("/statistics/churn/activity-trends")
    public ResponseEntity<AdminResponse.ActivityTrends> getActivityTrends(
            @RequestParam(defaultValue = "90") @Min(1) @Max(365) int days) {
        return ResponseEntity.ok(adminService.getActivityTrends(days));
    }

    // ==================== Subscriptions ====================

    @GetMapping("/subscriptions")
    public ResponseEntity<AdminResponse.SubscriptionList> getSubscriptions(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(adminService.getSubscriptions(page, size));
    }

    // ==================== Organizations ====================

    @GetMapping("/organizations")
    public ResponseEntity<AdminResponse.OrgList> getOrganizations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(adminService.getOrganizations(page, size, search));
    }

    @GetMapping("/organizations/deleted")
    public ResponseEntity<AdminResponse.OrgList> getDeletedOrganizations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(adminService.getDeletedOrganizations(page, size, search));
    }

    @GetMapping("/organizations/{orgId}")
    public ResponseEntity<AdminResponse.OrgDetail> getOrganization(@PathVariable String orgId) {
        return ResponseEntity.ok(adminService.getOrganization(orgId));
    }

    @PatchMapping("/organizations/{orgId}")
    public ResponseEntity<AdminResponse.OrgDetail> updateOrganization(
            @PathVariable String orgId, @Valid @RequestBody AdminRequest.UpdateOrganization request) {
        return ResponseEntity.ok(adminService.updateOrganization(orgId, request));
    }

    @DeleteMapping("/organizations/{orgId}")
    public ResponseEntity<Map<String, String>> deleteOrganization(@PathVariable String orgId) {
        adminService.deleteOrganization(orgId);
        return ResponseEntity.ok(Map.of("message", "조직이 삭제되었습니다. 복구 가능합니다."));
    }

    @PostMapping("/organizations/{orgId}/restore")
    public ResponseEntity<Map<String, String>> restoreOrganization(@PathVariable String orgId) {
        adminService.restoreOrganization(orgId);
        return ResponseEntity.ok(Map.of("message", "조직이 복구되었습니다"));
    }

    @DeleteMapping("/organizations/{orgId}/permanent")
    public ResponseEntity<Map<String, String>> permanentlyDeleteOrganization(@PathVariable String orgId) {
        adminService.permanentlyDeleteOrganization(orgId);
        return ResponseEntity.ok(Map.of("message", "조직이 영구 삭제되었습니다"));
    }

    @PostMapping("/organizations/{orgId}/transfer-ownership")
    public ResponseEntity<AdminResponse.OrgDetail> transferOrgOwnership(
            @PathVariable String orgId, @Valid @RequestBody AdminRequest.TransferOrgOwnership request) {
        return ResponseEntity.ok(adminService.transferOrgOwnership(orgId, request));
    }

    @PatchMapping("/organizations/{orgId}/subscription")
    public ResponseEntity<AdminResponse.OrgDetail> updateOrgSubscription(
            @PathVariable String orgId, @Valid @RequestBody AdminRequest.UpdateOrgSubscription request) {
        return ResponseEntity.ok(adminService.updateOrgSubscription(orgId, request));
    }

    @PatchMapping("/organizations/{orgId}/ai-credits")
    public ResponseEntity<AdminResponse.OrgDetail> adjustOrgAiCredits(
            @PathVariable String orgId, @Valid @RequestBody AdminRequest.AdjustOrgAiCredits request) {
        return ResponseEntity.ok(adminService.adjustOrgAiCredits(orgId, request));
    }

    @PatchMapping("/organizations/{orgId}/extend-trial")
    public ResponseEntity<AdminResponse.OrgDetail> extendOrgTrial(
            @PathVariable String orgId, @Valid @RequestBody AdminRequest.ExtendOrgTrial request) {
        return ResponseEntity.ok(adminService.extendOrgTrial(orgId, request));
    }

    @GetMapping("/organizations/statistics")
    public ResponseEntity<AdminResponse.OrgStatistics> getOrgStatistics() {
        return ResponseEntity.ok(adminService.getOrgStatistics());
    }

    // ==================== Announcements ====================

    @GetMapping("/announcements")
    public ResponseEntity<List<AdminResponse.AnnouncementDetail>> getAnnouncements() {
        return ResponseEntity.ok(adminService.getAllAnnouncements());
    }

    @PostMapping("/announcements")
    public ResponseEntity<AdminResponse.AnnouncementDetail> createAnnouncement(
            @Valid @RequestBody AdminRequest.CreateAnnouncement request) {
        return ResponseEntity.ok(adminService.createAnnouncement(request));
    }

    @PutMapping("/announcements/{id}")
    public ResponseEntity<AdminResponse.AnnouncementDetail> updateAnnouncement(
            @PathVariable String id, @Valid @RequestBody AdminRequest.CreateAnnouncement request) {
        return ResponseEntity.ok(adminService.updateAnnouncement(id, request));
    }

    @DeleteMapping("/announcements/{id}")
    public ResponseEntity<Map<String, String>> deleteAnnouncement(@PathVariable String id) {
        adminService.deleteAnnouncement(id);
        return ResponseEntity.ok(Map.of("message", "공지사항이 삭제되었습니다"));
    }

    // ==================== System (Maintenance) ====================

    @GetMapping("/system/maintenance")
    public ResponseEntity<AdminResponse.MaintenanceStatus> getMaintenanceStatus() {
        return ResponseEntity.ok(adminService.getMaintenanceStatus());
    }

    @PostMapping("/system/maintenance")
    public ResponseEntity<AdminResponse.MaintenanceStatus> setMaintenanceMode(
            @Valid @RequestBody AdminRequest.SetMaintenance request) {
        return ResponseEntity.ok(adminService.setMaintenanceMode(request));
    }

    @GetMapping("/system/monetization")
    public ResponseEntity<Map<String, Boolean>> getMonetizationStatus() {
        return ResponseEntity.ok(Map.of("monetization_enabled", monetizationService.isMonetizationEnabled()));
    }

    @PutMapping("/system/monetization")
    public ResponseEntity<Map<String, Boolean>> setMonetizationStatus(@RequestBody Map<String, Boolean> request) {
        boolean enabled = request.getOrDefault("monetization_enabled", true);
        monetizationService.setMonetizationEnabled(enabled);
        return ResponseEntity.ok(Map.of("monetization_enabled", enabled));
    }

    // ==================== Inquiries ====================

    @GetMapping("/inquiries")
    public ResponseEntity<InquiryResponse.InquiryList> getInquiries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) InquiryStatus status) {
        return ResponseEntity.ok(inquiryService.getInquiries(page, size, status));
    }

    @GetMapping("/inquiries/{inquiryId}")
    public ResponseEntity<InquiryResponse.Detail> getInquiryDetail(@PathVariable String inquiryId) {
        return ResponseEntity.ok(inquiryService.getInquiryForAdmin(inquiryId));
    }

    @PostMapping("/inquiries/{inquiryId}/reply")
    public ResponseEntity<InquiryResponse.ReplyDetail> replyToInquiry(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId,
            @Valid @RequestBody InquiryRequest.Reply request) {
        return ResponseEntity.ok(inquiryService.replyToInquiry(inquiryId, principal.getUserId(), request));
    }

    @PatchMapping("/inquiries/{inquiryId}/status")
    public ResponseEntity<InquiryResponse.Detail> updateInquiryStatus(
            @PathVariable String inquiryId, @Valid @RequestBody InquiryRequest.UpdateStatus request) {
        return ResponseEntity.ok(inquiryService.updateInquiryStatus(inquiryId, request));
    }

    // ==================== AI API Key ====================
    //
    // 키 원문을 반환하는 엔드포인트는 의도적으로 존재하지 않는다.
    // 조회는 마스킹된 표기만, 교체는 쓰기 전용이다.

    /** 프로바이더별 키 상태 조회 (마스킹). */
    @GetMapping("/ai/keys")
    public ResponseEntity<AdminResponse.AiKeyList> getAiKeys() {
        return ResponseEntity.ok(aiKeyAdminService.getKeys());
    }

    /** 키 교체. 프로바이더에 실제 호출해 유효성을 확인한 뒤에만 저장한다. */
    @PutMapping("/ai/keys/{provider}")
    public ResponseEntity<AdminResponse.AiKeyStatus> rotateAiKey(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String provider,
            @Valid @RequestBody AdminRequest.RotateAiKey request) {
        return ResponseEntity.ok(aiKeyAdminService.rotate(provider, request.getApiKey(), principal));
    }

    /** 현재 설정된 키가 살아있는지 확인. */
    @PostMapping("/ai/keys/{provider}/verify")
    public ResponseEntity<AdminResponse.AiKeyStatus> verifyAiKey(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String provider) {
        return ResponseEntity.ok(aiKeyAdminService.verify(provider, principal));
    }

    /** 키 교체·검증 이력 (최신순). */
    @GetMapping("/ai/keys/logs")
    public ResponseEntity<AdminResponse.AiKeyLogList> getAiKeyLogs(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ResponseEntity.ok(aiKeyAdminService.getLogs(page, size));
    }
}
