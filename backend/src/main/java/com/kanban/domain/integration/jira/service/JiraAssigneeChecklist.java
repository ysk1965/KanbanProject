package com.kanban.domain.integration.jira.service;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.integration.jira.JiraIssueLink;

/**
 * "JIRA 담당자를 대표하는 체크리스트 항목"을 찾는 규약.
 *
 * <p>BRIDGE는 JIRA 담당자를 카드 자체가 아니라 체크리스트 항목으로 이관한다. 그래서 한 카드의
 * 여러 항목 중 <b>어느 것이 이슈의 담당자인가</b>를 알아야 한다.
 *
 * <p>원래는 제목 접두사({@value #PREFIX})가 그 표식을 겸했는데, 사람이 항목 제목을 이슈 제목으로
 * 바꿔 쓰는 순간 동기화가 그 항목을 못 찾고 담당 항목을 하나 더 만들어 버렸다. 그래서 표식을
 * 원장({@link JiraIssueLink#getJiraAssigneeItemId()})으로 옮겼다 — 이름을 바꿔도 소유권이 남는다.
 * 접두사는 이제 <b>표시 기본값</b>이자, 원장에 아직 표식이 없는 옛 카드를 위한 대비책일 뿐이다.
 */
final class JiraAssigneeChecklist {

    /** 담당자 항목 제목의 기본 접두사. */
    static final String PREFIX = "담당: ";

    /** 담당자를 알 수 없을 때 쓰는 제목 꼬리. */
    private static final String UNKNOWN = "이슈 처리";

    private JiraAssigneeChecklist() {}

    static String titleFor(String jiraDisplayName) {
        return PREFIX + (jiraDisplayName != null && !jiraDisplayName.isBlank() ? jiraDisplayName : UNKNOWN);
    }

    /** 제목이 아직 기본 형태인지 — 그럴 때만 동기화가 제목을 갱신한다(사람이 붙인 이름은 건드리지 않는다). */
    static boolean hasPrefix(ChecklistItem item) {
        return item != null && item.getTitle() != null && item.getTitle().startsWith(PREFIX);
    }

    /**
     * 이 카드에서 담당자를 대표하는 항목. 원장 표식이 우선이고, 없을 때만 접두사로 찾는다.
     * 접두사로 찾아낸 경우 그 자리에서 원장에 표식을 심어, 다음부터는 제목이 바뀌어도 따라간다.
     *
     * <p>표식된 항목이 사라졌으면(삭제·다른 카드로 이동) 사람이 그렇게 한 것이다. 표식만 걷으면
     * "원래 없음"과 구분되지 않아 다음 담당자 변경이 지운 항목을 도로 만들었다 — 그래서 걷는 대신
     * <b>떼어냄으로 기록</b>한다({@link JiraIssueLink#markAssigneeItemDetached()}). 그 기록은
     * 사람이 접두사 항목을 직접 되살려 여기 입양될 때 함께 지워진다.
     */
    static ChecklistItem findOwned(ChecklistItemRepository repository, String taskId, JiraIssueLink link) {
        String markedId = link.getJiraAssigneeItemId();
        if (markedId != null) {
            ChecklistItem marked = repository.findById(markedId).orElse(null);
            if (marked != null && marked.getTask() != null && taskId.equals(marked.getTask().getId())) {
                return marked;
            }
            link.markAssigneeItemDetached();   // 지워졌거나 다른 카드로 옮겨 감 — 사람의 손
        }

        ChecklistItem byPrefix = repository.findByTaskIdOrderByPositionAsc(taskId).stream()
            .filter(JiraAssigneeChecklist::hasPrefix)
            .findFirst()
            .orElse(null);
        if (byPrefix != null) link.linkAssigneeItem(byPrefix.getId());
        return byPrefix;
    }

    /** push 쪽 판정 — 이 항목이 이슈 담당자를 대표하는가. 조회 없이 끝내려고 id 비교를 먼저 한다. */
    static boolean isOwned(ChecklistItem item, JiraIssueLink link) {
        if (item == null) return false;
        String markedId = link.getJiraAssigneeItemId();
        if (markedId != null) return markedId.equals(item.getId());
        return hasPrefix(item);
    }
}
