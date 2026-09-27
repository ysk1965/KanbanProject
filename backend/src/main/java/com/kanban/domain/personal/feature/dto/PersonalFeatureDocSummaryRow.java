package com.kanban.domain.personal.feature.dto;

import java.time.LocalDateTime;

/** JPQL 생성자 프로젝션용 — 목록 조회에서 content를 빼고 읽는다. */
public record PersonalFeatureDocSummaryRow(
        String id,
        String featureKey,
        String title,
        Integer schemaVer,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
