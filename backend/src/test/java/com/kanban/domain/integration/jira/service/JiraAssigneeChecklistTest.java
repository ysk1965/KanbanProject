package com.kanban.domain.integration.jira.service;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.integration.jira.JiraIssueLink;
import com.kanban.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 담당 항목 소유권 판정 — 특히 <b>사람이 지운 항목을 동기화가 되살리지 않는가</b>.
 *
 * <p>표식이 사라진 항목을 가리킬 때 표식만 걷어 내면 "원래 없음"과 구분되지 않아,
 * JIRA 담당자가 바뀔 때마다 지운 항목이 부활했다(QA 핸드오프처럼 담당자가 자주 오가는
 * 이슈에서 실제로 반복 발생). 그래서 걷는 대신 떼어냄으로 기록하고, 그 기록이 있는 동안
 * 재생성을 막는다. 접두사 항목을 사람이 직접 되살리면 입양하면서 기록을 걷는다.
 */
class JiraAssigneeChecklistTest {

    private static final String TASK_ID = "task-1";

    private final ChecklistItemRepository repository = mock(ChecklistItemRepository.class);

    private JiraIssueLink linkMarkedWith(String itemId) {
        JiraIssueLink link = JiraIssueLink.builder().build();
        link.linkAssigneeItem(itemId);
        return link;
    }

    private ChecklistItem itemOn(String taskId, String itemId, String title) {
        return ChecklistItem.builder()
            .id(itemId)
            .task(Task.builder().id(taskId).build())
            .title(title)
            .build();
    }

    @Test
    void 표식된_항목이_지워졌으면_떼어냄으로_기록한다() {
        JiraIssueLink link = linkMarkedWith("gone");
        when(repository.findById("gone")).thenReturn(Optional.empty());
        when(repository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(List.of());

        ChecklistItem owned = JiraAssigneeChecklist.findOwned(repository, TASK_ID, link);

        assertNull(owned);
        assertNull(link.getJiraAssigneeItemId());
        assertTrue(link.isAssigneeItemDetached());   // 이 기록이 재생성을 막는다
    }

    @Test
    void 다른_카드로_옮겨간_항목도_떼어냄이다() {
        JiraIssueLink link = linkMarkedWith("moved");
        when(repository.findById("moved"))
            .thenReturn(Optional.of(itemOn("other-task", "moved", "담당: 유상건")));
        when(repository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(List.of());

        assertNull(JiraAssigneeChecklist.findOwned(repository, TASK_ID, link));
        assertTrue(link.isAssigneeItemDetached());
    }

    @Test
    void 표식된_항목이_살아있으면_이름을_바꿔_썼어도_그_항목이다() {
        JiraIssueLink link = linkMarkedWith("alive");
        when(repository.findById("alive"))
            .thenReturn(Optional.of(itemOn(TASK_ID, "alive", "[전투] 이슈 제목으로 바꿔 쓴 항목")));

        ChecklistItem owned = JiraAssigneeChecklist.findOwned(repository, TASK_ID, link);

        assertNotNull(owned);
        assertEquals("alive", owned.getId());
        assertFalse(link.isAssigneeItemDetached());
    }

    @Test
    void 접두사_항목을_직접_되살리면_입양하고_떼어냄_기록을_걷는다() {
        JiraIssueLink link = linkMarkedWith("gone");
        when(repository.findById(anyString())).thenReturn(Optional.empty());
        when(repository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(List.of());

        assertNull(JiraAssigneeChecklist.findOwned(repository, TASK_ID, link));
        assertTrue(link.isAssigneeItemDetached());

        // 사람이 "담당: " 접두사 항목을 다시 만들어 두면 다음 동기화가 그 항목을 입양한다
        ChecklistItem revived = itemOn(TASK_ID, "revived", "담당: 유상건");
        when(repository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(List.of(revived));

        ChecklistItem owned = JiraAssigneeChecklist.findOwned(repository, TASK_ID, link);

        assertEquals("revived", owned.getId());
        assertEquals("revived", link.getJiraAssigneeItemId());
        assertFalse(link.isAssigneeItemDetached());   // 재생성으로 돌아오는 길
    }
}
