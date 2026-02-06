package com.kanban.domain.inquiry.dto;

import com.kanban.domain.inquiry.InquiryStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class InquiryRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Create {
        @NotBlank(message = "제목은 필수입니다")
        @Size(max = 200, message = "제목은 200자 이하로 입력해주세요")
        private String title;

        @NotBlank(message = "내용은 필수입니다")
        @Size(max = 5000, message = "내용은 5000자 이하로 입력해주세요")
        private String content;

        private List<String> fileKeys;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Reply {
        @NotBlank(message = "답변 내용은 필수입니다")
        @Size(max = 5000, message = "답변은 5000자 이하로 입력해주세요")
        private String content;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateStatus {
        private InquiryStatus status;
    }
}
