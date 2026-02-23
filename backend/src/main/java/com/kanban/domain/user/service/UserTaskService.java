package com.kanban.domain.user.service;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserTaskService {

    private final BoardService boardService;
    private final TaskRepository taskRepository;

    /**
     * 사용자의 모든 보드에서 Task를 필터링하여 보드별 그룹으로 반환
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getMyTasks(String userId, String filter) {
        // 사용자의 모든 보드 가져오기
        List<BoardResponse.Simple> boards = boardService.getMyBoards(userId);
        if (boards.isEmpty()) {
            return Map.of("boards", List.of(), "total_count", 0);
        }

        List<String> boardIds = boards.stream()
                .map(BoardResponse.Simple::getId)
                .collect(Collectors.toList());

        // 필터별 Task 조회
        List<Task> tasks;
        switch (filter != null ? filter : "today") {
            case "week" -> {
                LocalDate today = LocalDate.now();
                LocalDate endOfWeek = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
                tasks = taskRepository.findWeekTasksByBoardIds(boardIds, today, endOfWeek);
            }
            case "overdue" -> tasks = taskRepository.findOverdueTasksByBoardIds(boardIds);
            default -> tasks = taskRepository.findTodayTasksByBoardIds(boardIds); // "today"
        }

        // 보드별 그룹핑
        Map<String, List<Task>> grouped = tasks.stream()
                .collect(Collectors.groupingBy(t -> t.getBoard().getId(), LinkedHashMap::new, Collectors.toList()));

        // 보드 정보 매핑
        Map<String, BoardResponse.Simple> boardMap = boards.stream()
                .collect(Collectors.toMap(BoardResponse.Simple::getId, b -> b));

        List<Map<String, Object>> boardGroups = new ArrayList<>();
        for (var entry : grouped.entrySet()) {
            BoardResponse.Simple board = boardMap.get(entry.getKey());
            if (board == null) continue;

            List<Map<String, Object>> taskList = entry.getValue().stream()
                    .map(t -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", t.getId());
                        m.put("title", t.getTitle());
                        m.put("due_date", t.getDueDate());
                        m.put("is_completed", t.getIsCompleted());
                        m.put("block_name", t.getBlock().getName());
                        m.put("feature_title", t.getFeature().getTitle());
                        m.put("feature_color", t.getFeature().getColor());
                        return m;
                    })
                    .collect(Collectors.toList());

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("board_id", board.getId());
            group.put("board_name", board.getName());
            group.put("board_type", board.getBoardType());
            group.put("tasks", taskList);
            boardGroups.add(group);
        }

        return Map.of(
                "boards", boardGroups,
                "total_count", tasks.size(),
                "filter", filter != null ? filter : "today"
        );
    }
}
