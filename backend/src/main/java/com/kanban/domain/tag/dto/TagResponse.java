package com.kanban.domain.tag.dto;

import com.kanban.domain.tag.Tag;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class TagResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String color;
        private LocalDateTime createdAt;

        public static Detail of(Tag tag) {
            return Detail.builder()
                    .id(tag.getId())
                    .name(tag.getName())
                    .color(tag.getColor())
                    .createdAt(tag.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> tags;

        public static ListResponse of(List<Tag> tags) {
            return ListResponse.builder()
                    .tags(tags.stream().map(Detail::of).toList())
                    .build();
        }
    }
}
