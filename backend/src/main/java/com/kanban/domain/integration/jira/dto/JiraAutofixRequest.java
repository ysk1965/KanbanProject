package com.kanban.domain.integration.jira.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

public class JiraAutofixRequest {

    /** 큐 투입. 비우면 조건을 만족하는 후보 전부, 지정하면 그중에서만. */
    @Getter @Setter @NoArgsConstructor
    public static class Enqueue {
        private List<String> issueKeys;
    }
}
