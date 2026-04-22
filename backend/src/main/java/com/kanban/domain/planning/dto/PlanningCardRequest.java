package com.kanban.domain.planning.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * Planning Card 요청 DTO.
 * Jackson SNAKE_CASE 전략으로 자동 변환:
 *   - weekStartDate ↔ week_start_date
 *   - assigneeId ↔ assignee_id
 *   - estimatedHours ↔ estimated_hours
 *   - cardIds ↔ card_ids
 */
public class PlanningCardRequest {

    /**
     * 플래닝 카드 생성 요청.
     * weekStartDate / assigneeId 가 모두 null 이면 풀(Pool) 생성.
     */
    public record CreateRequest(
            @NotBlank(message = "제목은 필수입니다")
            @Size(max = 200, message = "제목은 200자 이하여야 합니다")
            String title,

            String description,

            String assigneeId,

            @JsonFormat(pattern = "yyyy-MM-dd")
            LocalDate weekStartDate,

            @DecimalMin(value = "0.0", message = "예상 시간은 0 이상이어야 합니다")
            Double estimatedHours,

            @Size(max = 16, message = "컬러는 16자 이하여야 합니다")
            String color,

            @Min(value = 0, message = "position은 0 이상이어야 합니다")
            Integer position
    ) {
    }

    /**
     * 플래닝 카드 내용 수정 요청.
     * 배치 정보(assignee, week_start_date)는 move 엔드포인트에서만 변경 가능.
     */
    public record UpdateRequest(
            @Size(max = 200, message = "제목은 200자 이하여야 합니다")
            String title,

            String description,

            @DecimalMin(value = "0.0", message = "예상 시간은 0 이상이어야 합니다")
            Double estimatedHours,

            @Size(max = 16, message = "컬러는 16자 이하여야 합니다")
            String color
    ) {
    }

    /**
     * 플래닝 카드 이동 요청.
     * weekStartDate, assigneeId 모두 null 이면 풀(Pool)로 복귀.
     * position 은 셀 또는 풀 내에서의 순서.
     */
    public record MoveRequest(
            @JsonFormat(pattern = "yyyy-MM-dd")
            LocalDate weekStartDate,

            String assigneeId,

            Integer position
    ) {
    }

    /**
     * 동일 셀(또는 풀) 내 카드 순서 재정렬 요청.
     * weekStartDate, assigneeId null 조합은 풀 내부 정렬을 의미.
     */
    public record ReorderRequest(
            @JsonFormat(pattern = "yyyy-MM-dd")
            LocalDate weekStartDate,

            String assigneeId,

            @NotEmpty(message = "정렬할 카드 ID 목록이 비어 있습니다")
            List<String> cardIds
    ) {
    }
}
