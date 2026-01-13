package com.kanban.domain.milestone.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

public class MilestoneRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Create {
        @NotBlank(message = "제목은 필수입니다")
        @Size(max = 100, message = "제목은 100자 이하여야 합니다")
        private String title;

        private String description;

        @NotNull(message = "시작일은 필수입니다")
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate startDate;

        @NotNull(message = "종료일은 필수입니다")
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate endDate;

        private List<String> featureIds;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Update {
        @Size(max = 100, message = "제목은 100자 이하여야 합니다")
        private String title;

        private String description;

        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate startDate;

        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate endDate;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AddFeatures {
        @NotNull(message = "Feature ID 목록은 필수입니다")
        private List<String> featureIds;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CreateAllocation {
        @NotBlank(message = "멤버 ID는 필수입니다")
        private String memberId;

        @NotNull(message = "참여 일수는 필수입니다")
        private Integer workingDays;

        @NotNull(message = "총 할당 시간은 필수입니다")
        private Double totalAllocatedHours;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateAllocation {
        private Integer workingDays;
        private Double totalAllocatedHours;
    }
}
