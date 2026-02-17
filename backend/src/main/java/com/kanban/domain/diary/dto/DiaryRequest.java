package com.kanban.domain.diary.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class DiaryRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotNull(message = "일기 날짜는 필수입니다")
        private LocalDate diaryDate;
    }

    @Getter
    @NoArgsConstructor
    public static class SendMessage {
        @NotBlank(message = "메시지 내용은 필수입니다")
        private String content;
    }

    @Getter
    @NoArgsConstructor
    public static class Complete {
        private String title;
        private String content;
        private String mood;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        private String title;
        private String content;
        private String mood;
    }
}
