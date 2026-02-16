package com.kanban.domain.comment.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class CommentAIResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        private String taskId;
        private String summary;
        private List<String> decisions;
        private List<String> openQuestions;
        private List<ActionItem> actionItems;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ActionItem {
        private String title;
        private String assigneeHint;
    }
}
