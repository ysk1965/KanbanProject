package com.kanban.domain.mindmap.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class MindMapShareRequest {

    /** 공유 설정 upsert 요청. expiresAt은 null이면 무기한. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Update {
        private boolean enabled;
        private boolean showTasks = true;
        private boolean showAssignees;
        private boolean showMemos;
        private LocalDateTime expiresAt;
    }
}
