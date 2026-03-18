package com.kanban.domain.board.dto;

import com.kanban.domain.board.BoardResource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class BoardResourceResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private String url;
        private String description;
        private String faviconUrl;
        private Integer displayOrder;
        private String createdByName;
        private LocalDateTime createdAt;

        public static Detail of(BoardResource resource) {
            return Detail.builder()
                    .id(resource.getId())
                    .title(resource.getTitle())
                    .url(resource.getUrl())
                    .description(resource.getDescription())
                    .faviconUrl(resource.getFaviconUrl())
                    .displayOrder(resource.getDisplayOrder())
                    .createdByName(resource.getCreatedBy() != null ? resource.getCreatedBy().getName() : null)
                    .createdAt(resource.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> resources;
        private int totalCount;

        public static ListResponse of(List<BoardResource> resources) {
            return ListResponse.builder()
                    .resources(resources.stream().map(Detail::of).toList())
                    .totalCount(resources.size())
                    .build();
        }
    }
}
