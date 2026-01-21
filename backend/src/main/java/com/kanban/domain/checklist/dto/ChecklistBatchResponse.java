package com.kanban.domain.checklist.dto;

import com.kanban.domain.checklist.ChecklistItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Getter
@Builder
@AllArgsConstructor
public class ChecklistBatchResponse {

    private List<TaskChecklistGroup> checklists;

    public static ChecklistBatchResponse of(List<ChecklistItem> items) {
        // Task ID별로 그룹핑
        Map<String, List<ChecklistItem>> groupedByTask = items.stream()
                .collect(Collectors.groupingBy(item -> item.getTask().getId()));

        List<TaskChecklistGroup> groups = groupedByTask.entrySet().stream()
                .map(entry -> TaskChecklistGroup.of(entry.getKey(), entry.getValue()))
                .toList();

        return ChecklistBatchResponse.builder()
                .checklists(groups)
                .build();
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TaskChecklistGroup {
        private String taskId;
        private int total;
        private int completed;
        private List<ChecklistResponse.Detail> items;

        public static TaskChecklistGroup of(String taskId, List<ChecklistItem> items) {
            int total = items.size();
            int completed = (int) items.stream().filter(ChecklistItem::getIsCompleted).count();

            return TaskChecklistGroup.builder()
                    .taskId(taskId)
                    .total(total)
                    .completed(completed)
                    .items(items.stream()
                            .sorted((a, b) -> a.getPosition().compareTo(b.getPosition()))
                            .map(ChecklistResponse.Detail::of)
                            .toList())
                    .build();
        }
    }
}
