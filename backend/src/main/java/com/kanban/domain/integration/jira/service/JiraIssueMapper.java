package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * JIRA 이슈 JsonNode → {@link ParsedJiraIssue}. 순수 파싱 (레포지토리 의존 없음).
 * 매핑 규칙 적용(status→block 등)과 영속화는 JiraImportService가 담당.
 */
@Component
public class JiraIssueMapper {

    public ParsedJiraIssue parse(JsonNode issue) {
        JsonNode fields = issue.path("fields");

        JsonNode issuetype = fields.path("issuetype");
        int hierarchyLevel = issuetype.path("hierarchyLevel").asInt(0);
        boolean isEpic = hierarchyLevel >= 1;
        boolean isSubtask = issuetype.path("subtask").asBoolean(false);

        JsonNode status = fields.path("status");
        JsonNode priority = fields.path("priority");
        JsonNode assignee = fields.path("assignee");
        JsonNode parent = fields.path("parent");
        JsonNode project = fields.path("project");

        return new ParsedJiraIssue(
            issue.path("key").asText(null),
            issue.path("id").asText(null),
            isEpic,
            isSubtask,
            textOrNull(fields, "summary"),
            JiraAdfConverter.toPlainText(fields.get("description")),
            status.path("id").asText(null),
            textOrNull(status, "name"),
            textOrNull(status.path("statusCategory"), "key"),
            priority.isMissingNode() || priority.isNull() ? null : textOrNull(priority, "name"),
            names(fields.get("components")),
            strings(fields.get("labels")),
            assignee.isMissingNode() || assignee.isNull() ? null : textOrNull(assignee, "accountId"),
            assignee.isMissingNode() || assignee.isNull() ? null : textOrNull(assignee, "displayName"),
            parent.isMissingNode() || parent.isNull() ? null : textOrNull(parent, "key"),
            parseDateTime(textOrNull(fields, "updated")),
            attachments(fields.get("attachment")),
            project.isMissingNode() || project.isNull() ? null : textOrNull(project, "key"),
            project.isMissingNode() || project.isNull() ? null : textOrNull(project, "name")
        );
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    private List<String> names(JsonNode array) {
        List<String> out = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode n : array) {
                if (n.hasNonNull("name")) out.add(n.get("name").asText());
            }
        }
        return out;
    }

    private List<String> strings(JsonNode array) {
        List<String> out = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode n : array) {
                if (!n.isNull()) out.add(n.asText());
            }
        }
        return out;
    }

    private List<ParsedJiraIssue.Attachment> attachments(JsonNode array) {
        List<ParsedJiraIssue.Attachment> out = new ArrayList<>();
        if (array != null && array.isArray()) {
            for (JsonNode a : array) {
                String content = a.path("content").asText(null);
                if (content == null) continue;
                out.add(new ParsedJiraIssue.Attachment(
                    a.path("filename").asText("attachment"),
                    a.path("mimeType").asText("application/octet-stream"),
                    content,
                    a.path("size").asLong(0)
                ));
            }
        }
        return out;
    }

    private LocalDateTime parseDateTime(String value) {
        if (value == null) return null;
        try {
            return OffsetDateTime.parse(value).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
