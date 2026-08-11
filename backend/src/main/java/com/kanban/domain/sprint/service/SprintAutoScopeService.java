package com.kanban.domain.sprint.service;

import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintColumnRepository;
import com.kanban.domain.sprint.SprintFeatureRepository;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.task.Task;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 담기 단위가 피쳐가 되면서 생긴 자동 편입 규칙.
 *
 * <p>피쳐가 활성 스프린트에 담겨 있으면(sprint_features 매핑) 그 피쳐에 새로 생기거나
 * 마일스톤이 옮겨 온 태스크는 별도 조작 없이 같은 스프린트의 Sprint(START) 컬럼으로 들어온다.
 * TaskService 쪽 뮤테이션 경로에서 호출한다 — 리포지토리에만 의존해 순환 참조가 없다.
 */
@Service
@RequiredArgsConstructor
public class SprintAutoScopeService {

    private final SprintRepository sprintRepository;
    private final SprintFeatureRepository sprintFeatureRepository;
    private final SprintColumnRepository sprintColumnRepository;

    /** 태스크 생성 직후 호출 — 피쳐가 활성 스프린트에 담겨 있으면 태스크를 자동 편입한다. */
    public void adoptIntoActiveSprint(Task task) {
        if (task.getSprint() != null || task.getMilestone() == null || task.getFeature() == null) {
            return;
        }
        Sprint active = sprintRepository
                .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(task.getMilestone().getId(), SprintStatus.ACTIVE)
                .orElse(null);
        if (active == null
                || !sprintFeatureRepository.existsBySprintIdAndFeatureId(active.getId(), task.getFeature().getId())) {
            return;
        }
        sprintColumnRepository.findFirstByMilestoneIdAndKind(task.getMilestone().getId(), SprintColumnKind.START)
                .ifPresent(start -> task.assignToSprint(active, start));
    }

    /**
     * 마일스톤 재배정 직후 호출 — 옛 마일스톤의 스프린트에 남아 있으면 빼고,
     * 새 마일스톤에서 피쳐 담김 여부에 따라 자동 편입을 시도한다.
     */
    public void syncMilestoneChange(Task task) {
        if (task.getSprint() != null) {
            String sprintMilestoneId = task.getSprint().getMilestone().getId();
            if (task.getMilestone() == null || !sprintMilestoneId.equals(task.getMilestone().getId())) {
                task.removeFromSprint();
            }
        }
        adoptIntoActiveSprint(task);
    }
}
