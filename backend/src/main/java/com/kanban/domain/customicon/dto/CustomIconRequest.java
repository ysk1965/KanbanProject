package com.kanban.domain.customicon.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class CustomIconRequest {

    @Getter
    @NoArgsConstructor
    public static class AnalyzeStyle {
        @NotBlank(message = "레퍼런스 ID는 필수입니다")
        private String referenceId;
    }

    @Getter
    @NoArgsConstructor
    public static class Generate {
        @NotBlank(message = "레퍼런스 ID는 필수입니다")
        private String referenceId;

        @NotEmpty(message = "아이콘 이름 목록은 필수입니다")
        @Size(min = 1, max = 16, message = "아이콘은 1~16개까지 가능합니다")
        private List<String> iconNames;

        private String layout = "4x4";

        private StyleOptions styleOptions;

        @Size(max = 500, message = "커스텀 프롬프트는 500자까지 가능합니다")
        private String customPrompt;
    }

    @Getter
    @NoArgsConstructor
    public static class StyleOptions {
        private String type = "line";
        private String strokeWeight = "medium";
        private String cornerRadius = "rounded";
        private double paddingRatio = 0.15;
        private String background = "transparent";
        private boolean showGridLines = false;
    }
}
