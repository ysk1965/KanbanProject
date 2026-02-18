package com.kanban.domain.diary.dto;

import com.kanban.domain.diary.DiaryEntry;
import com.kanban.domain.diary.DiaryMessage;
import com.kanban.domain.diary.DiaryStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class DiaryResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private LocalDate diaryDate;
        private String title;
        private String mood;
        private DiaryStatus status;
        private LocalDateTime createdAt;

        public static Simple of(DiaryEntry entry) {
            return Simple.builder()
                    .id(entry.getId())
                    .diaryDate(entry.getDiaryDate())
                    .title(entry.getTitle())
                    .mood(entry.getMood())
                    .status(entry.getStatus())
                    .createdAt(entry.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private LocalDate diaryDate;
        private String title;
        private String content;
        private String mood;
        private DiaryStatus status;
        private List<MessageDetail> messages;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(DiaryEntry entry) {
            return Detail.builder()
                    .id(entry.getId())
                    .diaryDate(entry.getDiaryDate())
                    .title(entry.getTitle())
                    .content(entry.getContent())
                    .mood(entry.getMood())
                    .status(entry.getStatus())
                    .messages(entry.getMessages().stream()
                            .map(MessageDetail::of)
                            .toList())
                    .createdAt(entry.getCreatedAt())
                    .updatedAt(entry.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MessageDetail {
        private String id;
        private String role;
        private String content;
        private int messageOrder;
        private String audioUrl;
        private Integer audioDurationSeconds;
        private LocalDateTime createdAt;

        public static MessageDetail of(DiaryMessage message) {
            return MessageDetail.builder()
                    .id(message.getId())
                    .role(message.getRole())
                    .content(message.getContent())
                    .messageOrder(message.getMessageOrder())
                    .audioUrl(message.getAudioUrl())
                    .audioDurationSeconds(message.getAudioDurationSeconds())
                    .createdAt(message.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AiReply {
        private String diaryId;
        private MessageDetail userMessage;
        private MessageDetail aiMessage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class VoiceReply {
        private String diaryId;
        private String userText;
        private MessageDetail userMessage;
        private String aiText;
        private MessageDetail aiMessage;
        private String aiAudioUrl;
    }
}
