package com.kanban.domain.report.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskDependency;
import com.kanban.domain.task.TaskDependencyRepository;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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

    /** 태스크 설명이 프롬프트를 채우지 않도록 앞부분만 남긴다 */
    private static final int MAX_DESCRIPTION_CHARS = 300;

    /**
     * 태스크 하나가 실제로 어떤 하위 작업인지 드러내고(=태스크의 실체),
     * 커밋 subject를 항목과 대조해 소속 태스크를 짚을 수 있도록 체크리스트 내용을 넘긴다.
     * 다만 프롬프트가 항목으로 넘치지 않도록 태스크당 상한을 둔다.
     */
    private static final int MAX_CHECKLIST_ITEMS_PER_TASK = 15;

    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final TaskDependencyRepository taskDependencyRepository;
    private final ObjectMapper objectMapper;

    /** 태스크 하나의 체크리스트 집계 — 진척(done/total), 담당자, 그리고 항목 내용 목록. */
    private record ChecklistAgg(int total, int done, List<String> assignees, List<ChecklistLine> items) {
    }

    /** 체크리스트 항목 한 줄 — 내용·완료 여부·담당자. 커밋↔태스크 매칭의 단서가 된다. */
    private record ChecklistLine(String title, boolean done, String assignee) {
    }

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

        List<Task> displayed = new ArrayList<>();
        displayed.addAll(completed);
        displayed.addAll(inProgress);
        displayed.addAll(overdue);
        Map<String, ChecklistAgg> checklistMap = buildChecklistMap(displayed);
        Map<String, List<String>> blockedMap = buildBlockedMap(boardId, displayed);

        return SourceChunk.ok(SourceKind.KANBAN,
                toJson(completed, inProgress, overdue, today, checklistMap, blockedMap), metrics, summary);
    }

    /** 표시할 태스크들의 체크리스트를 한 번에 조회해 태스크별 진척·담당자·항목 내용으로 집계한다. */
    private Map<String, ChecklistAgg> buildChecklistMap(List<Task> tasks) {
        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        Map<String, List<ChecklistItem>> byTask = new HashMap<>();
        for (ChecklistItem item : checklistItemRepository.findByTaskIdInWithAssignee(taskIds)) {
            byTask.computeIfAbsent(item.getTask().getId(), k -> new ArrayList<>()).add(item);
        }
        Map<String, ChecklistAgg> result = new HashMap<>();
        for (Map.Entry<String, List<ChecklistItem>> e : byTask.entrySet()) {
            List<ChecklistItem> items = e.getValue();
            // 화면과 같은 순서(position)로 정렬해 항목 흐름이 자연스럽게 읽히도록.
            items.sort(Comparator.comparing(ci -> ci.getPosition() == null ? 0 : ci.getPosition()));
            int done = 0;
            LinkedHashSet<String> assignees = new LinkedHashSet<>();
            List<ChecklistLine> lines = new ArrayList<>();
            for (ChecklistItem item : items) {
                boolean itemDone = Boolean.TRUE.equals(item.getIsCompleted());
                if (itemDone) {
                    done++;
                }
                String name = assigneeName(item);
                if (name != null) {
                    assignees.add(name);
                }
                if (lines.size() < MAX_CHECKLIST_ITEMS_PER_TASK) {
                    lines.add(new ChecklistLine(item.getTitle(), itemDone, name));
                }
            }
            result.put(e.getKey(), new ChecklistAgg(items.size(), done,
                    new ArrayList<>(assignees), lines));
        }
        return result;
    }

    /** 체크리스트 항목의 담당자 이름 — 멤버(User) 또는 외주(Contractor). */
    private String assigneeName(ChecklistItem item) {
        if (item.getAssignee() != null && item.getAssignee().getName() != null) {
            return item.getAssignee().getName();
        }
        if (item.getContractor() != null && item.getContractor().getName() != null) {
            return item.getContractor().getName();
        }
        return null;
    }

    /** 아직 완료되지 않은 선행 태스크가 있으면 "막힌 것"으로 본다 — risks의 근거가 된다. */
    private Map<String, List<String>> buildBlockedMap(String boardId, List<Task> tasks) {
        Set<String> displayedIds = tasks.stream().map(Task::getId).collect(java.util.stream.Collectors.toSet());
        Map<String, List<String>> blocked = new HashMap<>();
        for (TaskDependency dep : taskDependencyRepository.findByBoardIdWithFetch(boardId)) {
            Task predecessor = dep.getPredecessor();
            Task successor = dep.getSuccessor();
            if (successor == null || predecessor == null || !displayedIds.contains(successor.getId())) {
                continue;
            }
            if (Boolean.TRUE.equals(predecessor.getIsCompleted())) {
                continue;   // 선행이 끝났으면 막힌 게 아니다
            }
            blocked.computeIfAbsent(successor.getId(), k -> new ArrayList<>()).add(predecessor.getTitle());
        }
        return blocked;
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

    private String toJson(List<Task> completed, List<Task> inProgress, List<Task> overdue,
                          LocalDate today, Map<String, ChecklistAgg> checklistMap,
                          Map<String, List<String>> blockedMap) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("completed", describe(completed, today, checklistMap, blockedMap));
        root.put("in_progress", describe(inProgress, today, checklistMap, blockedMap));
        root.put("overdue", describe(overdue, today, checklistMap, blockedMap));
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("칸반 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }

    private List<Map<String, Object>> describe(List<Task> tasks, LocalDate today,
                                               Map<String, ChecklistAgg> checklistMap,
                                               Map<String, List<String>> blockedMap) {
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
                    if (task.getDescription() != null && !task.getDescription().isBlank()) {
                        item.put("description", truncate(task.getDescription()));
                    }
                    ChecklistAgg agg = checklistMap.get(task.getId());
                    if (agg != null && agg.total() > 0) {
                        item.put("checklist_done", agg.done());
                        item.put("checklist_total", agg.total());
                        if (!agg.items().isEmpty()) {
                            item.put("checklist", describeChecklist(agg.items()));
                        }
                        if (!agg.assignees().isEmpty()) {
                            item.put("assignees", agg.assignees());
                        }
                    }
                    List<String> blockedBy = blockedMap.get(task.getId());
                    if (blockedBy != null && !blockedBy.isEmpty()) {
                        item.put("blocked_by", blockedBy);
                    }
                    if (task.getQaState() != null) {
                        item.put("qa_state", task.getQaState().name());
                    }
                    if (task.getDueDate() != null) {
                        item.put("due_date", task.getDueDate().toString());
                        if (task.getDueDate().isBefore(today)) {
                            item.put("days_overdue", ChronoUnit.DAYS.between(task.getDueDate(), today));
                        }
                    }
                    if (task.getCompletedAt() != null) {
                        item.put("completed_at", task.getCompletedAt().toString());
                    }
                    return item;
                })
                .toList();
    }

    /** 체크리스트 항목을 {title, done, assignee} 형태로 펼친다 — 태스크의 실체와 커밋 매칭 단서. */
    private List<Map<String, Object>> describeChecklist(List<ChecklistLine> lines) {
        return lines.stream()
                .map(line -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("title", line.title());
                    m.put("done", line.done());
                    if (line.assignee() != null) {
                        m.put("assignee", line.assignee());
                    }
                    return m;
                })
                .toList();
    }

    private String truncate(String text) {
        String trimmed = text.strip();
        return trimmed.length() > MAX_DESCRIPTION_CHARS
                ? trimmed.substring(0, MAX_DESCRIPTION_CHARS) + "…"
                : trimmed;
    }
}
