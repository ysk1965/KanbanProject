package com.kanban.domain.organization.leave.dto;

import com.kanban.domain.organization.leave.*;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class LeaveDto {

    // ==================== Request DTOs ====================

    @Getter
    @NoArgsConstructor
    public static class CreatePolicy {
        @NotBlank(message = "정책 이름은 필수입니다")
        private String name;
        @NotNull(message = "휴가 카테고리는 필수입니다")
        private LeaveCategory leaveCategory;
        private BigDecimal defaultDays;
        private Boolean isPaid;
        private Boolean requiresApproval;
        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdatePolicy {
        private String name;
        private BigDecimal defaultDays;
        private Boolean isPaid;
        private Boolean requiresApproval;
        private String description;
        private Boolean isActive;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateBalance {
        @NotNull(message = "총 휴가일수는 필수입니다")
        private BigDecimal totalDays;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateLeaveRequest {
        @NotBlank(message = "정책 ID는 필수입니다")
        private String policyId;
        @NotNull(message = "시작일은 필수입니다")
        private LocalDate startDate;
        @NotNull(message = "종료일은 필수입니다")
        private LocalDate endDate;
        private LeaveDurationType durationType;
        private String reason;
    }

    @Getter
    @NoArgsConstructor
    public static class RejectLeaveRequest {
        private String comment;
    }

    // ==================== Response DTOs ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PolicyResponse {
        private String id;
        private String name;
        private LeaveCategory leaveCategory;
        private BigDecimal defaultDays;
        private Boolean isPaid;
        private Boolean requiresApproval;
        private String description;
        private Integer displayOrder;
        private Boolean isActive;
        private LocalDateTime createdAt;

        public static PolicyResponse of(LeavePolicy policy) {
            return PolicyResponse.builder()
                    .id(policy.getId())
                    .name(policy.getName())
                    .leaveCategory(policy.getLeaveCategory())
                    .defaultDays(policy.getDefaultDays())
                    .isPaid(policy.getIsPaid())
                    .requiresApproval(policy.getRequiresApproval())
                    .description(policy.getDescription())
                    .displayOrder(policy.getDisplayOrder())
                    .isActive(policy.getIsActive())
                    .createdAt(policy.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BalanceResponse {
        private String id;
        private String policyId;
        private String policyName;
        private LeaveCategory leaveCategory;
        private Integer year;
        private BigDecimal totalDays;
        private BigDecimal usedDays;
        private BigDecimal remaining;

        public static BalanceResponse of(LeaveBalance balance) {
            return BalanceResponse.builder()
                    .id(balance.getId())
                    .policyId(balance.getPolicy().getId())
                    .policyName(balance.getPolicy().getName())
                    .leaveCategory(balance.getPolicy().getLeaveCategory())
                    .year(balance.getYear())
                    .totalDays(balance.getTotalDays())
                    .usedDays(balance.getUsedDays())
                    .remaining(balance.getRemaining())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LeaveRequestResponse {
        private String id;
        private RequesterInfo requester;
        private PolicyInfo policy;
        private LocalDate startDate;
        private LocalDate endDate;
        private LeaveDurationType durationType;
        private BigDecimal totalDays;
        private String reason;
        private LeaveStatus status;
        private ReviewerInfo reviewer;
        private LocalDateTime reviewedAt;
        private String reviewComment;
        private LocalDateTime createdAt;

        public static LeaveRequestResponse of(LeaveRequest request) {
            return LeaveRequestResponse.builder()
                    .id(request.getId())
                    .requester(request.getRequester() != null ? RequesterInfo.of(request.getRequester()) : null)
                    .policy(PolicyInfo.of(request.getPolicy()))
                    .startDate(request.getStartDate())
                    .endDate(request.getEndDate())
                    .durationType(request.getDurationType())
                    .totalDays(request.getTotalDays())
                    .reason(request.getReason())
                    .status(request.getStatus())
                    .reviewer(request.getReviewer() != null ? ReviewerInfo.of(request.getReviewer()) : null)
                    .reviewedAt(request.getReviewedAt())
                    .reviewComment(request.getReviewComment())
                    .createdAt(request.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RequesterInfo {
        private String memberId;
        private String name;
        private String email;
        private String departmentName;

        public static RequesterInfo of(OrganizationMember member) {
            return RequesterInfo.builder()
                    .memberId(member.getId())
                    .name(member.getUser().getName())
                    .email(member.getUser().getEmail())
                    .departmentName(member.getDepartment() != null ? member.getDepartment().getName() : null)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ReviewerInfo {
        private String memberId;
        private String name;

        public static ReviewerInfo of(OrganizationMember member) {
            return ReviewerInfo.builder()
                    .memberId(member.getId())
                    .name(member.getUser().getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PolicyInfo {
        private String id;
        private String name;
        private LeaveCategory leaveCategory;

        public static PolicyInfo of(LeavePolicy policy) {
            return PolicyInfo.builder()
                    .id(policy.getId())
                    .name(policy.getName())
                    .leaveCategory(policy.getLeaveCategory())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LeaveRequestPageResponse {
        private List<LeaveRequestResponse> content;
        private long totalElements;
        private int totalPages;
        private int page;
        private int size;
    }
}
