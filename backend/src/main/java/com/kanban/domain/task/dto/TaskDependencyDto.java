package com.kanban.domain.task.dto;

import com.kanban.domain.task.TaskDependency;
import jakarta.validation.constraints.NotBlank;

public class TaskDependencyDto {

    public record CreateRequest(
        @NotBlank(message = "선행 Task ID는 필수입니다") String predecessorId,
        @NotBlank(message = "후행 Task ID는 필수입니다") String successorId
    ) {}

    public record Response(
        String id,
        String predecessorId,
        String successorId,
        String dependencyType,
        String createdAt
    ) {
        public static Response from(TaskDependency dep) {
            return new Response(
                dep.getId(),
                dep.getPredecessor().getId(),
                dep.getSuccessor().getId(),
                dep.getDependencyType(),
                dep.getCreatedAt().toString()
            );
        }
    }
}
