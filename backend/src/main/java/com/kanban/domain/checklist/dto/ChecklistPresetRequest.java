package com.kanban.domain.checklist.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class ChecklistPresetRequest {

    /** 생성/수정 공용 — 수정은 항목 전체 교체(full replace) */
    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Save {
        @NotBlank
        @Size(max = 100)
        private String name;

        @Size(max = 16)
        private String icon;

        @NotNull
        @Valid
        private List<Item> items;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        @NotBlank
        @Size(max = 255)
        private String title;

        /** 적용 시 담당자로 지정할 보드 멤버 user id (선택) */
        @Size(max = 36)
        private String assigneeId;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Apply {
        @NotBlank
        private String presetId;
    }
}
