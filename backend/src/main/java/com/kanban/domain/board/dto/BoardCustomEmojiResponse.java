package com.kanban.domain.board.dto;

import com.kanban.domain.board.BoardCustomEmoji;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class BoardCustomEmojiResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String imageUrl;
        private String contentType;
        private Long fileSize;
        private String uploadedByName;
        private LocalDateTime createdAt;

        public static Detail of(BoardCustomEmoji emoji) {
            return Detail.builder()
                    .id(emoji.getId())
                    .name(emoji.getName())
                    .imageUrl(emoji.getImageUrl())
                    .contentType(emoji.getContentType())
                    .fileSize(emoji.getFileSize())
                    .uploadedByName(emoji.getUploadedBy() != null ? emoji.getUploadedBy().getName() : null)
                    .createdAt(emoji.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> emojis;
        private int totalCount;

        public static ListResponse of(List<BoardCustomEmoji> emojis) {
            return ListResponse.builder()
                    .emojis(emojis.stream().map(Detail::of).toList())
                    .totalCount(emojis.size())
                    .build();
        }
    }
}
