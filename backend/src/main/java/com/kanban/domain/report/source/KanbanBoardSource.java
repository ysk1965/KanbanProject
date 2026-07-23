package com.kanban.domain.report.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * 보드의 그 기간 활동 — 완료된 태스크, 진행 중, 지연.
 *
 * <p>칸반은 항상 "연결"되어 있다. 보드 자체가 소스이므로 별도 인증이 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KanbanBoardSource implements ReportSource {

    /** AI 입력이 지나치게 길어지지 않도록 종류별 상한을 둔다 */
    private static final int MAX_ITEMS_PER_GROUP = 40;

    private final TaskRepository taskRepository;
    private final ObjectMapper objectMapper;

    @Override
    public SourceKind kind() {
        return SourceKind.KANBAN;
    }

    @Override
    public boolean isConfigured(String boardId) {
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public SourceChunk collect(String boardId, ReportPeriod period) {
        LocalDateTime start = period.startInclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime end = period.endExclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDate today = period.endExclusive().toLocalDate();

        List<Task> tasks;
        try {
            tasks = taskRepository.findByBoardIdWithFetch(boardId);
        } catch (Exception e) {
            log.warn("칸반 수집 실패 board={}: {}", boardId, e.getMessage());
            return SourceChunk.failed(SourceKind.KANBAN, e.getMessage());
        }

        List<Task> completed = new ArrayList<>();
        List<Task> inProgress = new ArrayList<>();
        List<Task> overdue = new ArrayList<>();

        for (Task task : tasks) {
            if (task.getDeletedAt() != null) {
                continue;
            }
            boolean isCompleted = Boolean.TRUE.equals(task.getIsCompleted());
            LocalDateTime completedAt = task.getCompletedAt();

            if (isCompleted && completedAt != null
                    && !completedAt.isBefore(start) && completedAt.isBefore(end)) {
                completed.add(task);
                continue;
            }
            if (isCompleted) {
                continue;
            }
            // 미완료 중 마감이 지난 것은 지연, 나머지는 진행 중으로 본다.
            if (task.getDueDate() != null && task.getDueDate().isBefore(today)) {
                overdue.add(task);
            } else if (isActiveInPeriod(task, start, end, today)) {
                inProgress.add(task);
            }
        }

        if (completed.isEmpty() && inProgress.isEmpty() && overdue.isEmpty()) {
            return SourceChunk.empty(SourceKind.KANBAN, "기간 내 태스크 변화 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("completed_tasks", completed.size());
        metrics.put("in_progress_tasks", inProgress.size());
        metrics.put("overdue_tasks", overdue.size());

        String summary = "완료 " + completed.size() + "건 · 진행 중 " + inProgress.size()
                + "건 · 지연 " + overdue.size() + "건";

        return SourceChunk.ok(SourceKind.KANBAN,
                toJson(completed, inProgress, overdue), metrics, summary);
    }

    /**
     * 시작일이 이미 지났거나 기간 안에 걸쳐 있으면 진행 중으로 본다.
     * 시작일이 없으면 마감이 기간 안이나 그 이후인 것만 센다 — 아직 손대지 않은 백로그까지
     * 전부 "진행 중"으로 세면 숫자가 무의미해진다.
     */
    private boolean isActiveInPeriod(Task task, LocalDateTime start, LocalDateTime end, LocalDate today) {
        if (task.getStartDate() != null) {
            return !task.getStartDate().isAfter(today);
        }
        return task.getDueDate() != null && !task.getDueDate().isBefore(today.minusDays(7));
    }

    private String toJson(List<Task> completed, List<Task> inProgress, List<Task> overdue) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("completed", describe(completed));
        root.put("in_progress", describe(inProgress));
        root.put("overdue", describe(overdue));
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("칸반 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }

    private List<Map<String, Object>> describe(List<Task> tasks) {
        return tasks.stream()
                .limit(MAX_ITEMS_PER_GROUP)
                .map(task -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("title", task.getTitle());
                    if (task.getTaskKey() != null) {
                        item.put("key", task.getTaskKey());
                    }
                    if (task.getFeature() != null) {
                        item.put("feature", task.getFeature().getTitle());
                    }
                    if (task.getBlock() != null) {
                        item.put("column", task.getBlock().getName());
                    }
                    if (task.getDueDate() != null) {
                        item.put("due_date", task.getDueDate().toString());
                    }
                    if (task.getCompletedAt() != null) {
                        item.put("completed_at", task.getCompletedAt().toString());
                    }
                    return item;
                })
                .toList();
    }
}
