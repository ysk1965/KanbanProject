package com.kanban.domain.personal.feature.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

import java.util.Map;

public class PersonalFeatureDocRequest {

    /** POST /docs — 프런트는 항상 title과 content(기능의 기본 템플릿)를 함께 보낸다. */
    @Getter
    public static class Create {
        @NotBlank
        @Size(max = 200)
        private String title;

        /** 없으면 빈 객체로 저장한다. */
        private Map<String, Object> content;

        private Integer schemaVer;
    }

    /** PATCH /docs/{id} — 온 필드만 갱신한다. content는 부분 병합이 아니라 통째 교체다. */
    @Getter
    public static class Patch {
        @Size(max = 200)
        private String title;

        private Map<String, Object> content;
    }
}
