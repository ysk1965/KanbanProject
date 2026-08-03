package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * JIRA API v3의 설명/댓글은 ADF(Atlassian Document Format, 중첩 JSON)로 온다.
 * 저장은 평문이면 충분하므로 텍스트 노드를 걷어 개행 기준으로 이어붙인다.
 * (이미지/미디어 노드는 무시 — 실제 파일은 issue.fields.attachment[]에서 별도 처리)
 *
 * <p>{@link #toAdf}는 역방향 — BRIDGE 평문 댓글을 JIRA에 쓰기 위한 최소 ADF(문단 배열)를 만든다.
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

    /**
     * 평문 → ADF doc. 줄바꿈은 {@code hardBreak} 노드로 낸다.
     *
     * <p>줄마다 문단을 쪼개지 않는 이유: 문단은 {@link #toPlainText}에서 빈 줄({@code \n\n})로 돌아와
     * 왕복할 때마다 줄 간격이 벌어진다. hardBreak는 개행 하나로 되돌아와 원문이 그대로 보존된다.
     *
     * <p>빈 줄에 text 노드를 만들지 않는 것도 중요하다 — ADF에서 빈 문자열 text 노드는 유효하지 않아
     * JIRA가 400으로 거부한다.
     */
    static ObjectNode toAdf(ObjectMapper mapper, String plainText) {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("type", "doc");
        doc.put("version", 1);

        ObjectNode paragraph = doc.putArray("content").addObject();
        paragraph.put("type", "paragraph");

        String text = plainText != null ? plainText : "";
        if (text.isEmpty()) return doc;   // content 없는 빈 문단

        ArrayNode inline = paragraph.putArray("content");
        String[] lines = text.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) inline.addObject().put("type", "hardBreak");
            if (lines[i].isEmpty()) continue;
            ObjectNode textNode = inline.addObject();
            textNode.put("type", "text");
            textNode.put("text", lines[i]);
        }
        return doc;
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
