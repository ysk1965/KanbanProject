package com.kanban.domain.planning.dto;

import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.planning.PlanningCard;
import com.kanban.domain.user.User;
import com.kanban.global.util.UtilizationStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Planning Card 응답 DTO.
 * Jackson SNAKE_CASE 전략으로 자동 변환 (Java camelCase → JSON snake_case).
 */
public class PlanningCardResponse {

    /**
     * 보드 멤버 최소 정보 — email 등 민감 필드 노출 금지.
     */
    public record UserRef(String id, String name, String profileImage) {
        public static UserRef from(User user) {
            if (user == null) {
                return null;
            }
            return new UserRef(user.getId(), user.getName(), user.getProfileImage());
        }
    }

    /**
     * 플래닝 카드 단건.
     */
    public record CardDto(
            String id,
            String title,
            String description,
            UserRef assignee,
            LocalDate weekStartDate,
            String primaryMilestoneId,
            Double estimatedHours,
            Integer position,
            String color,
            UserRef createdBy,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            String promotedTaskId,
            LocalDateTime promotedAt
    ) {
        public static CardDto from(PlanningCard card) {
            if (card == null) {
                return null;
            }
            return new CardDto(
                    card.getId(),
                    card.getTitle(),
                    card.getDescription(),
                    UserRef.from(card.getAssignee()),
                    card.getWeekStartDate(),
                    card.getPrimaryMilestone() != null ? card.getPrimaryMilestone().getId() : null,
                    card.getEstimatedHours(),
                    card.getPosition(),
                    card.getColor(),
                    UserRef.from(card.getCreatedBy()),
                    card.getCreatedAt(),
                    card.getUpdatedAt(),
                    card.getPromotedTask() != null ? card.getPromotedTask().getId() : null,
                    card.getPromotedAt()
            );
        }
    }

    /**
     * 주차 헤더 렌더링용 정보.
     */
    public record WeekInfo(
            LocalDate startDate,
            int isoWeek,
            String primaryMilestoneId
    ) {
    }

    /**
     * 마일스톤 타임라인 바 렌더링용 참조.
     */
    public record MilestoneRef(
            String id,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            String color,
            int progressPercentage
    ) {
        public static MilestoneRef of(Milestone milestone, int progressPercentage) {
            return new MilestoneRef(
                    milestone.getId(),
                    milestone.getTitle(),
                    milestone.getStartDate(),
                    milestone.getEndDate(),
                    null,
                    progressPercentage
            );
        }
    }

    /**
     * 멤버 행 라벨 (Y축).
     */
    public record MemberRef(String id, String name, String profileImage) {
        public static MemberRef from(User user) {
            return new MemberRef(user.getId(), user.getName(), user.getProfileImage());
        }
    }

    /**
     * (멤버 × 주차) 셀 집계.
     * capacity_hours == null → status = UNKNOWN (자동 fallback 없음).
     */
    public record CellSummary(
            LocalDate weekStartDate,
            String assigneeId,
            int cardCount,
            double loadHours,
            Double capacityHours,
            Double utilization,
            String status
    ) {
        public static CellSummary of(
                LocalDate weekStartDate,
                String assigneeId,
                int cardCount,
                double loadHours,
                Double capacityHours
        ) {
            UtilizationStatus statusEnum = UtilizationStatus.determine(loadHours, capacityHours);
            Double utilization;
            if (capacityHours == null || capacityHours <= 0) {
                utilization = null;
            } else {
                utilization = Math.round(loadHours / capacityHours * 10000.0) / 10000.0;
            }
            return new CellSummary(
                    weekStartDate,
                    assigneeId,
                    cardCount,
                    Math.round(loadHours * 100.0) / 100.0,
                    capacityHours != null ? Math.round(capacityHours * 100.0) / 100.0 : null,
                    utilization,
                    statusEnum.name()
            );
        }
    }

    /**
     * 멤버 행 합계 (모든 주차 누적).
     */
    public record RowTotal(
            String assigneeId,
            double loadHours,
            Double capacityHours,
            String status
    ) {
        public static RowTotal of(String assigneeId, double loadHours, Double capacityHours) {
            return new RowTotal(
                    assigneeId,
                    Math.round(loadHours * 100.0) / 100.0,
                    capacityHours != null ? Math.round(capacityHours * 100.0) / 100.0 : null,
                    UtilizationStatus.determine(loadHours, capacityHours).name()
            );
        }
    }

    /**
     * 주차 열 합계 (모든 멤버 누적).
     */
    public record ColumnTotal(
            LocalDate weekStartDate,
            double loadHours,
            Double capacityHours,
            String status
    ) {
        public static ColumnTotal of(LocalDate weekStartDate, double loadHours, Double capacityHours) {
            return new ColumnTotal(
                    weekStartDate,
                    Math.round(loadHours * 100.0) / 100.0,
                    capacityHours != null ? Math.round(capacityHours * 100.0) / 100.0 : null,
                    UtilizationStatus.determine(loadHours, capacityHours).name()
            );
        }
    }

    /**
     * 하단 풀 통계.
     */
    public record PoolSummary(int cardCount, double loadHours) {
        public static PoolSummary of(int cardCount, double loadHours) {
            return new PoolSummary(cardCount, Math.round(loadHours * 100.0) / 100.0);
        }
    }

    /**
     * GET list 응답의 집계 블록.
     */
    public record SummaryDto(
            List<WeekInfo> weeks,
            List<MilestoneRef> milestones,
            List<MemberRef> members,
            List<CellSummary> cells,
            List<RowTotal> rowTotals,
            List<ColumnTotal> columnTotals,
            PoolSummary pool
    ) {
    }

    /**
     * GET /planning-cards 전체 응답.
     */
    public record ListResponse(List<CardDto> cards, SummaryDto summary) {
    }
}
