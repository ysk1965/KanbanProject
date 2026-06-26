package com.kanban.domain.contractor.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

public class BoardContractorRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "외주 이름은 필수입니다")
        @Size(max = 50, message = "외주 이름은 50자 이내여야 합니다")
        private String name;

        @NotBlank(message = "관리자 멤버는 필수입니다")
        private String managerMemberId;

        private String jobRoleId;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        private LocalDate startDate;
        private LocalDate endDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 50, message = "외주 이름은 50자 이내여야 합니다")
        private String name;

        private String managerMemberId;

        private String jobRoleId;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;
    }

    /** 계약 기간 추가(=갱신/연장). */
    @Getter
    @NoArgsConstructor
    public static class PeriodCreate {
        private LocalDate startDate;
        private LocalDate endDate;
    }

    /** 계약 기간 수정. clear 플래그로 시작/종료일 개별 비우기. */
    @Getter
    @NoArgsConstructor
    public static class PeriodUpdate {
        private LocalDate startDate;
        private LocalDate endDate;
        private boolean clearStartDate;
        private boolean clearEndDate;
    }

    /** 워크로드 뷰 숨김/표시 토글. */
    @Getter
    @NoArgsConstructor
    public static class Visibility {
        private boolean hidden;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotEmpty(message = "외주 ID 목록은 필수입니다")
        private List<String> ids;
    }
}
