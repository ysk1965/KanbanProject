package com.kanban.domain.test;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TestDataResponse {
    private String boardId;
    private String boardName;
    private int memberCount;
    private int featureCount;
    private int taskCount;
    private int checklistItemCount;
    private int scheduleBlockCount;
    private int commentCount;
    private String message;
}
