package com.kanban.domain.checklist.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
public class ChecklistBatchRequest {

    @NotEmpty(message = "Task ID 목록은 필수입니다")
    private List<String> taskIds;
}
