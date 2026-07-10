package com.kanban.domain.task.dto;

/**
 * 사람이 읽는 태스크 키 해석 결과. Jackson SNAKE_CASE로 board_id / task_id 로 직렬화된다.
 */
public record TaskKeyResponse(String boardId, String taskId) {
}
