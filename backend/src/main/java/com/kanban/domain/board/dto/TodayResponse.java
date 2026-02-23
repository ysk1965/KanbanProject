package com.kanban.domain.board.dto;

import com.kanban.domain.dailychecklist.dto.DailyChecklistResponse;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.task.dto.TaskResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class TodayResponse {
    private List<TaskResponse.Simple> dueTodayTasks;
    private List<TaskResponse.Simple> inProgressTasks;
    private List<PersonalEventResponse.Detail> personalEvents;
    private List<DailyChecklistResponse.ItemResponse> dailyChecklist;
    private double completionRate;
}
