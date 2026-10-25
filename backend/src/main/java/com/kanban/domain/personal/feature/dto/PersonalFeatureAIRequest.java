package com.kanban.domain.personal.feature.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

public class PersonalFeatureAIRequest {

    /** POST /ai/polish — 선택한 문장을 매끄럽게 다듬는다 */
    @Getter
    public static class Polish {
        @NotBlank
        @Size(max = 2000)
        private String text;
    }
}
