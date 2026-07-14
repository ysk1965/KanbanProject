package com.kanban.domain.integration.jira.service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * JIRA 이슈 JSON을 import에 필요한 필드만 뽑아낸 값 객체.
 */
public record ParsedJiraIssue(
    String key,                 // "QASA-2"
    String id,                  // "19963"
    boolean isEpic,             // hierarchyLevel >= 1
    boolean isSubtask,
    String summary,
    String description,         // ADF → 평문
    String statusId,
    String statusName,          // "1. 할 일"
    String priorityName,        // "Normal"
    List<String> componentNames,// ["QA"]
    List<String> labels,
    String assigneeAccountId,   // nullable
    String assigneeDisplayName, // nullable
    String parentKey,           // nullable ("QASA-1")
    LocalDateTime updated,
    List<Attachment> attachments,
    String projectKey,          // "QASA" — 프로젝트(Space) 그룹핑 키
    String projectName          // "[QA] 스텔라나이츠" — Feature 이름
) {
    public record Attachment(
        String filename,
        String mimeType,
        String contentUrl,
        long size
    ) {}
}
