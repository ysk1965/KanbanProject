package com.kanban.domain.milestone;

import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.task.TaskRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 마일스톤 진행률 집계 {@code @Query} JPQL이 실제로 파싱되는지 확인한다.
 *
 * <p>진행률은 체크리스트 항목 기준({@link ChecklistItemRepository#countByMilestoneAndFeature}),
 * 태스크 카운트는 참고용({@link TaskRepository#countByMilestoneAndFeature})이다.
 * 두 쿼리 모두 (마일스톤, 피처) 그룹 집계라 조인 경로·필드명이 어긋나면 기동 시점에 터지므로
 * 여기서 한 번 실행해 SQL 생성까지 검증한다. 단언은 느슨하다 — 값어치는 파싱 자체에 있다.</p>
 */
@DataJpaTest
@ActiveProfiles("local")
@DisplayName("마일스톤 진행률 집계 JPQL 파싱")
class MilestoneProgressRepositoryQueryTest {

    private static final String BOARD_ID = "board-does-not-exist";

    @Autowired
    private ChecklistItemRepository checklistItemRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Test
    @DisplayName("체크리스트 (마일스톤, 피처) 집계 쿼리가 파싱된다")
    void checklistCountsByMilestoneFeatureParses() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        assertThat(checklistItemRepository.countByMilestoneAndFeature(BOARD_ID, today)).isEmpty();
    }

    @Test
    @DisplayName("태스크 (마일스톤, 피처) 집계 쿼리가 파싱된다")
    void taskCountsByMilestoneFeatureParses() {
        assertThat(taskRepository.countByMilestoneAndFeature(BOARD_ID)).isEmpty();
    }
}
