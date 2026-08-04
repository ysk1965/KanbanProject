package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * JIRA 이슈 JsonNode → {@link ParsedJiraIssue}. 순수 파싱 (레포지토리 의존 없음).
 * 매핑 규칙 적용(status→block 등)과 영속화는 JiraImportService가 담당.
 */
@Slf4j
@Component
public class JiraIssueMapper {

    /**
     * JIRA Cloud의 날짜 포맷 — {@code 2026-08-04T15:37:03.449+0900}처럼 <b>오프셋에 콜론이 없다</b>.
     * {@code OffsetDateTime.parse}가 쓰는 ISO_OFFSET_DATE_TIME은 {@code +09:00}만 받아 이 값을 거부하므로
     * 두 형태를 모두 받는 포맷터를 직접 만든다.
     *
     * <p>여기서 파싱에 실패하면 {@code updated}가 null이 되고, 그러면
     * {@code JiraIssueLink.isStaleAgainst(null)}이 항상 false를 반환해 <b>증분 판정에 기대는 기능이
     * 통째로 조용히 멈춘다</b> — 웹훅 단건 pull, 댓글 대조(reconcile), 자동수정 재판정. 로그도 남기는 이유.
     */
    private static final DateTimeFormatter JIRA_DATE_TIME = new DateTimeFormatterBuilder()
        .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        .optionalStart().appendOffset("+HH:MM", "Z").optionalEnd()
        .optionalStart().appendOffset("+HHMM", "Z").optionalEnd()
        .optionalStart().appendOffset("+HH", "Z").optionalEnd()
        .toFormatter(Locale.ROOT);

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

    /** JIRA 날짜 → UTC LocalDateTime. 오프셋이 없는 값은 이미 UTC로 본다. */
    private LocalDateTime parseDateTime(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            TemporalAccessor parsed = JIRA_DATE_TIME.parseBest(value, OffsetDateTime::from, LocalDateTime::from);
            return parsed instanceof OffsetDateTime odt
                ? odt.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()
                : (LocalDateTime) parsed;
        } catch (DateTimeParseException e) {
            log.warn("JIRA 날짜 파싱 실패 — 증분 동기화(웹훅 pull/댓글 대조)가 멈춘다: '{}'", value);
            return null;
        }
    }
}
