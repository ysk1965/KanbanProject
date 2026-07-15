package com.kanban.domain.personal.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.task.Task;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.util.List;

/**
 * 크로스보드 "내 담당 미완료 체크리스트" 응답.
 * <p>
 * MCP {@code list_my_checklist_items} 전용. 커밋 ↔ 체크리스트 매칭 후 곧바로
 * {@code toggle_checklist_item} / {@code add_checklist_item} 을 호출할 수 있도록
 * board_id · task_id · checklist_item_id 를 모두 노출한다.
 */
@Getter
@Builder
@AllArgsConstructor
public class MyChecklistItemsResponse {

    private int total;
    private List<Item> items;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Item {
        private String checklistItemId;
        private String title;
        private boolean completed;
        private LocalDate startDate;
        private LocalDate dueDate;
        private String boardId;
        private String boardName;
        private String taskId;
        private String taskTitle;
        private String featureTitle;
        private String featureColor;

        public static Item of(ChecklistItem ci) {
            Task task = ci.getTask();
            return Item.builder()
                    .checklistItemId(ci.getId())
                    .title(ci.getTitle())
                    .completed(Boolean.TRUE.equals(ci.getIsCompleted()))
                    .startDate(ci.getStartDate())
                    .dueDate(ci.getDueDate())
                    .boardId(task.getBoard().getId())
                    .boardName(task.getBoard().getName())
                    .taskId(task.getId())
                    .taskTitle(task.getTitle())
                    .featureTitle(task.getFeature() != null ? task.getFeature().getTitle() : null)
                    .featureColor(task.getFeature() != null ? task.getFeature().getColor() : null)
                    .build();
        }
    }

    public static MyChecklistItemsResponse of(List<ChecklistItem> items) {
        List<Item> mapped = items.stream().map(Item::of).toList();
        return MyChecklistItemsResponse.builder()
                .total(mapped.size())
                .items(mapped)
                .build();
    }
}
