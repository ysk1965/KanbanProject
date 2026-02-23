package com.kanban.domain.customicon.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class CustomIconResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UploadResult {
        private String referenceId;
        private String url;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class StyleAnalysis {
        private String style;
        private String strokeWeight;
        private String cornerRadius;
        private String fill;
        private String detail;
        private double paddingRatio;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class GenerateResult {
        private String jobId;
        private String spriteSheetUrl;
        private List<IconInfo> icons;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class IconInfo {
        private String name;
        private int index;
        private String url;
        private String size;
    }
}
