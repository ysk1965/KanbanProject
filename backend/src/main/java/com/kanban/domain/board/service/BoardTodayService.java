package com.kanban.domain.board.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.dto.TodayResponse;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.dailychecklist.dto.DailyChecklistResponse;
import com.kanban.domain.personal.PersonalEventRepository;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardTodayService {

    private final BoardRepository boardRepository;
    private final PersonalEventRepository personalEventRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final BoardService boardService;
    private final TaskService taskService;

    public TodayResponse getToday(String boardId, String userId) {
        boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        boardService.checkViewerOrAbove(boardId, userId);

        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        // 기존 TaskService 활용 (N+1 방지된 배치 조회)
        TaskResponse.ListResponse allTasks = taskService.getTasks(boardId, userId, null, null, null);

        // 오늘 마감 Task (미완료)
        List<TaskResponse.Simple> dueTodayTasks = allTasks.getTasks().stream()
                .filter(t -> today.equals(t.getDueDate()) && !t.isCompleted())
                .toList();

        // 진행중 Task (미완료)
        List<TaskResponse.Simple> inProgressTasks = allTasks.getTasks().stream()
                .filter(t -> !t.isCompleted())
                .toList();

        // 오늘 PersonalEvent (user_id 기준)
        List<PersonalEventResponse.Detail> personalEvents = personalEventRepository
                .findByUserIdAndDate(userId, today)
                .stream()
                .map(PersonalEventResponse.Detail::of)
                .toList();

        // 오늘 DailyChecklist
        List<DailyChecklist> dailyChecklists = dailyChecklistRepository
                .findByBoardIdAndAssignedDateAndAssigneeIdOrderByPositionAsc(boardId, today, userId);
        List<DailyChecklistResponse.ItemResponse> dailyChecklistResponses = dailyChecklists.stream()
                .map(DailyChecklistResponse.ItemResponse::of)
                .toList();

        // 완료율
        long totalTasks = allTasks.getTasks().size();
        long completedTasks = allTasks.getTasks().stream().filter(TaskResponse.Simple::isCompleted).count();
        double completionRate = totalTasks > 0 ? (double) completedTasks / totalTasks : 0.0;

        return TodayResponse.builder()
                .dueTodayTasks(dueTodayTasks)
                .inProgressTasks(inProgressTasks)
                .personalEvents(personalEvents)
                .dailyChecklist(dailyChecklistResponses)
                .completionRate(completionRate)
                .build();
    }
}
