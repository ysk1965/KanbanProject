package com.kanban.domain.checklist.dto;

import com.kanban.domain.checklist.ChecklistPreset;
import com.kanban.domain.checklist.ChecklistPresetItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class ChecklistPresetResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String icon;
        private int itemCount;
        private List<ItemInfo> items;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(ChecklistPreset preset) {
            List<ItemInfo> items = preset.getItems().stream()
                    .map(ItemInfo::of)
                    .toList();
            return Detail.builder()
                    .id(preset.getId())
                    .name(preset.getName())
                    .icon(preset.getIcon())
                    .itemCount(items.size())
                    .items(items)
                    .createdAt(preset.getCreatedAt())
                    .updatedAt(preset.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ItemInfo {
        private String id;
        private String title;
        private String assigneeId;
        private Integer sortOrder;

        public static ItemInfo of(ChecklistPresetItem item) {
            return ItemInfo.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .assigneeId(item.getAssigneeId())
                    .sortOrder(item.getSortOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> presets;

        public static ListResponse of(List<ChecklistPreset> presets) {
            return ListResponse.builder()
                    .presets(presets.stream().map(Detail::of).toList())
                    .build();
        }
    }

    /** 프리셋 적용 결과 — 생성된 항목은 기존 체크리스트 응답 DTO 형태로 내려준다. */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ApplyResult {
        private int createdCount;
        private int skippedDuplicates;
        private List<ChecklistResponse.Detail> checklists;
    }
}
