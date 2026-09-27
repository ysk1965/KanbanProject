package com.kanban.domain.personal.feature.dto;

import com.kanban.domain.personal.feature.PersonalFeatureDoc;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.Map;

public class PersonalFeatureDocResponse {

    /** 목록용 — content 없음 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Summary {
        private String id;
        private String featureKey;
        private String title;
        private Integer schemaVer;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Summary of(PersonalFeatureDocSummaryRow row) {
            return Summary.builder()
                    .id(row.id())
                    .featureKey(row.featureKey())
                    .title(row.title())
                    .schemaVer(row.schemaVer())
                    .createdAt(row.createdAt())
                    .updatedAt(row.updatedAt())
                    .build();
        }
    }

    /** 상세 — content 포함 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String featureKey;
        private String title;
        private Integer schemaVer;
        private Map<String, Object> content;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(PersonalFeatureDoc doc) {
            return Detail.builder()
                    .id(doc.getId())
                    .featureKey(doc.getFeatureKey())
                    .title(doc.getTitle())
                    .schemaVer(doc.getSchemaVer())
                    .content(doc.getContent())
                    .createdAt(doc.getCreatedAt())
                    .updatedAt(doc.getUpdatedAt())
                    .build();
        }
    }
}
