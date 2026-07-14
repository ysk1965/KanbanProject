package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * JIRA API v3의 설명/댓글은 ADF(Atlassian Document Format, 중첩 JSON)로 온다.
 * 저장은 평문이면 충분하므로 텍스트 노드를 걷어 개행 기준으로 이어붙인다.
 * (이미지/미디어 노드는 무시 — 실제 파일은 issue.fields.attachment[]에서 별도 처리)
 */
final class JiraAdfConverter {

    private JiraAdfConverter() {}

    static String toPlainText(JsonNode adf) {
        if (adf == null || adf.isNull()) return null;
        StringBuilder sb = new StringBuilder();
        walk(adf, sb);
        String text = sb.toString().replaceAll("\n{3,}", "\n\n").trim();
        return text.isEmpty() ? null : text;
    }

    private static void walk(JsonNode node, StringBuilder sb) {
        if (node == null) return;
        String type = node.path("type").asText("");

        switch (type) {
            case "text" -> sb.append(node.path("text").asText(""));
            case "hardBreak" -> sb.append("\n");
            case "paragraph", "heading" -> {
                walkContent(node, sb);
                sb.append("\n\n");
            }
            case "listItem" -> {
                sb.append("- ");
                walkContent(node, sb);
                sb.append("\n");
            }
            case "bulletList", "orderedList", "blockquote", "codeBlock", "doc", "" -> walkContent(node, sb);
            case "mention" -> sb.append(node.path("attrs").path("text").asText(""));
            default -> walkContent(node, sb); // 알 수 없는 블록은 자식만 순회
        }
    }

    private static void walkContent(JsonNode node, StringBuilder sb) {
        JsonNode content = node.get("content");
        if (content != null && content.isArray()) {
            for (JsonNode child : content) {
                walk(child, sb);
            }
        }
    }
}
