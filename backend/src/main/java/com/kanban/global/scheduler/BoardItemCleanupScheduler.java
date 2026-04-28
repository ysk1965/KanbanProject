package com.kanban.global.scheduler;

import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.service.FeatureService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.service.TaskService;
import com.kanban.domain.trash.service.TrashService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * 30일 보관기간이 지난 소프트 삭제 항목(Feature/Task/ChecklistItem)을 영구 삭제.
 * 매일 04:30 UTC 실행 — BoardCleanupScheduler(04:00)와 분리해서 락 경합 방지.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BoardItemCleanupScheduler {

    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final FeatureService featureService;
    private final TaskService taskService;
    private final ChecklistService checklistService;

    @Scheduled(cron = "0 30 4 * * *")
    public void cleanupExpiredItems() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(TrashService.RETENTION_DAYS);

        List<Object[]> expiredChecklists = checklistItemRepository.findExpiredSoftDeletedWithBoardId(cutoff);
        List<Task> expiredTasks = taskRepository.findExpiredSoftDeleted(cutoff);
        List<Feature> expiredFeatures = featureRepository.findExpiredSoftDeleted(cutoff);

        if (expiredChecklists.isEmpty() && expiredTasks.isEmpty() && expiredFeatures.isEmpty()) {
            return;
        }

        log.info("Trash cleanup: cutoff={}, features={}, tasks={}, checklists={}",
                cutoff, expiredFeatures.size(), expiredTasks.size(), expiredChecklists.size());

        // Order: checklist → task → feature (children first to avoid orphan FK issues)
        int ckOk = 0, taskOk = 0, featOk = 0;
        for (Object[] row : expiredChecklists) {
            String itemId = (String) row[0];
            String boardId = (String) row[1];
            try {
                checklistService.hardDeleteChecklistItem(boardId, itemId);
                ckOk++;
            } catch (Exception e) {
                log.error("cleanup checklist {}: {}", itemId, e.getMessage());
            }
        }
        for (Task t : expiredTasks) {
            try {
                String boardId = t.getBoard().getId();
                taskService.hardDeleteTask(boardId, t.getId());
                taskOk++;
            } catch (Exception e) {
                log.error("cleanup task {}: {}", t.getId(), e.getMessage());
            }
        }
        for (Feature f : expiredFeatures) {
            try {
                String boardId = f.getBoard().getId();
                featureService.hardDeleteFeature(boardId, f.getId());
                featOk++;
            } catch (Exception e) {
                log.error("cleanup feature {}: {}", f.getId(), e.getMessage());
            }
        }

        log.info("Trash cleanup completed: features={}/{}, tasks={}/{}, checklists={}/{}",
                featOk, expiredFeatures.size(), taskOk, expiredTasks.size(), ckOk, expiredChecklists.size());
    }
}
