package com.kanban.domain.report.service;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.FeatureStatus;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 보고서의 "기능별 진행 현황"과 "스프린트 진행" 블록을 <b>시스템이 직접 집계</b>한다.
 *
 * <p>지표(metrics)와 같은 원칙 — 숫자·상태를 AI에 맡기지 않는다. feature/task/sprint 도메인의
 * 비정규화 카운터와 FK(Task.feature_id, ChecklistItem.sprint_id)를 그대로 읽어 정확한 값을 만든다.
 *
 * <p>이 집계는 <b>best-effort</b>다. 여기서 나는 예외로 보고서 전체가 실패하면 안 되므로,
 * feature/sprint 각각을 독립적으로 try/catch 하고 실패 시 부분/빈 결과를 돌려준다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BoardProgressCollector {

    private static final int MAX_FEATURES = 15;
    private static final int MAX_TASKS_PER_FEATURE = 10;

    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final SprintRepository sprintRepository;
    private final ChecklistItemRepository checklistItemRepository;

    public record Progress(ReportContent.Sprint sprint, List<ReportContent.Feature> features) {
    }

    @Transactional(readOnly = true)
    public Progress compute(String boardId, ReportPeriod period) {
        List<ReportContent.Feature> features = List.of();
        try {
            features = computeFeatures(boardId, period);
        } catch (Exception e) {
            log.warn("기능별 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        ReportContent.Sprint sprint = null;
        try {
            sprint = computeSprint(boardId);
        } catch (Exception e) {
            log.warn("스프린트 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        return new Progress(sprint, features);
    }

    /** 진행 중 feature + 기간 내 완료된 feature. lastActivity 내림차순, 최대 {@value #MAX_FEATURES}개. */
    private List<ReportContent.Feature> computeFeatures(String boardId, ReportPeriod period) {
        LocalDateTime startUtc = period.startInclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endUtc = period.endExclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        Map<String, Feature> byId = new LinkedHashMap<>();
        for (Feature f : featureRepository.findByBoardIdAndStatus(boardId, FeatureStatus.ACTIVE)) {
            byId.put(f.getId(), f);
        }
        for (Feature f : featureRepository.findByBoardIdAndStatusAndCompletedAtBetween(
                boardId, FeatureStatus.COMPLETED, startUtc, endUtc)) {
            byId.putIfAbsent(f.getId(), f);
        }

        List<ReportContent.Feature> result = new ArrayList<>();
        for (Feature f : byId.values()) {
            List<Task> tasks = taskRepository.findByFeatureIdOrderByPositionAsc(f.getId());

            LocalDateTime lastActivity = tasks.stream()
                    .map(Task::getCompletedAt)
                    .filter(java.util.Objects::nonNull)
                    .max(Comparator.naturalOrder())
                    .orElse(f.getCompletedAt() != null ? f.getCompletedAt() : f.getUpdatedAt());

            List<String> assignees = new ArrayList<>();
            if (f.getAssignee() != null && f.getAssignee().getName() != null) {
                assignees.add(f.getAssignee().getName());
            }
            if (f.getContractor() != null && f.getContractor().getName() != null) {
                assignees.add(f.getContractor().getName());
            }

            List<ReportContent.FeatureTask> taskDtos = tasks.stream()
                    .limit(MAX_TASKS_PER_FEATURE)
                    .map(t -> ReportContent.FeatureTask.builder()
                            .title(t.getTitle())
                            .status(taskStatus(t, today))
                            .build())
                    .toList();

            result.add(ReportContent.Feature.builder()
                    .name(f.getTitle())
                    .status(f.getStatus() == FeatureStatus.COMPLETED ? "DONE" : "IN_PROGRESS")
                    .description(f.getDescription())
                    .taskDone(f.getCompletedTasks() != null ? f.getCompletedTasks() : 0)
                    .taskTotal(f.getTotalTasks() != null ? f.getTotalTasks() : 0)
                    .assignees(assignees)
                    .lastActivity(lastActivity != null ? lastActivity.toString() : null)
                    .tasks(taskDtos)
                    .build());
        }

        result.sort(Comparator.comparing(ReportContent.Feature::getLastActivity,
                Comparator.nullsLast(Comparator.reverseOrder())));

        return result.size() > MAX_FEATURES ? new ArrayList<>(result.subList(0, MAX_FEATURES)) : result;
    }

    /** isCompleted면 DONE, 시작일이 지났으면 IN_PROGRESS, 아니면 TODO. */
    private String taskStatus(Task t, LocalDate today) {
        if (Boolean.TRUE.equals(t.getIsCompleted())) {
            return "DONE";
        }
        if (t.getStartDate() != null && !t.getStartDate().isAfter(today)) {
            return "IN_PROGRESS";
        }
        return "TODO";
    }

    /** 보드의 활성 스프린트 게이지(done/total/inProgress/delayed). 활성 스프린트 없으면 null. */
    private ReportContent.Sprint computeSprint(String boardId) {
        List<Sprint> active = sprintRepository.findByBoardIdAndStatus(boardId, SprintStatus.ACTIVE);
        if (active.isEmpty()) {
            return null;
        }
        Sprint sprint = active.get(0); // 최신 시퀀스 우선
        List<ChecklistItem> items = checklistItemRepository.findBySprintId(sprint.getId());
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        int total = items.size();
        int done = 0;
        int delayed = 0;
        int inProgress = 0;
        for (ChecklistItem it : items) {
            boolean isDone = Boolean.TRUE.equals(it.getIsCompleted())
                    || (it.getSprintColumn() != null && it.getSprintColumn().getKind() == SprintColumnKind.END);
            if (isDone) {
                done++;
                continue;
            }
            if (it.getDueDate() != null && it.getDueDate().isBefore(today)) {
                delayed++;
                continue;
            }
            boolean inMiddle = it.getSprintColumn() != null
                    && it.getSprintColumn().getKind() == SprintColumnKind.MIDDLE;
            boolean started = it.getStartDate() != null && !it.getStartDate().isAfter(today);
            if (inMiddle || started) {
                inProgress++;
            }
            // 그 외는 미착수 — 별도 버킷 없이 total에만 포함
        }

        int percentage = total == 0 ? 0 : (int) Math.round(done * 100.0 / total);
        return ReportContent.Sprint.builder()
                .name(sprint.getName())
                .status("IN_PROGRESS")
                .done(done)
                .total(total)
                .inProgress(inProgress)
                .delayed(delayed)
                .percentage(percentage)
                .build();
    }
}
