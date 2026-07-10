package com.kanban.domain.note;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 노트 본문에서 링크 미리보기(og:description)용 평문 발췌를 추출한다.
 *
 * <p>본문 저장 형식은 첫 글자로 구분된다:
 * <ul>
 *   <li>{@code [} — BlockNote 문서 JSON (현재 기본). content/children의 text 런을 재귀 수집한다.</li>
 *   <li>{@code <} — 레거시 HTML. 태그를 제거한다.</li>
 *   <li>{@code {} — BOARD(화이트보드) JSON. 평문 발췌 불가 → null.</li>
 * </ul>
 */
public final class NoteExcerptExtractor {

    private NoteExcerptExtractor() {}

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_LEN = 180;
    private static final int WALK_CAP = MAX_LEN * 4;

    /** @return 평문 발췌(최대 180자, 초과 시 … 부가) 또는 발췌 불가 시 null */
    public static String extract(String content, NoteType type) {
        if (content == null || content.isBlank() || type == NoteType.BOARD) {
            return null;
        }
        String head = content.stripLeading();
        try {
            if (head.startsWith("[")) {
                StringBuilder sb = new StringBuilder();
                walk(MAPPER.readTree(content), sb);
                return normalize(sb.toString());
            }
            if (head.startsWith("<")) {
                String text = content
                        .replaceAll("<[^>]+>", " ")
                        .replace("&nbsp;", " ")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">");
                return normalize(text);
            }
        } catch (Exception e) {
            return null; // 파싱 실패 시 발췌 없이 진행
        }
        return null;
    }

    /** BlockNote 노드를 재귀 순회하며 모든 text 필드를 모은다. */
    private static void walk(JsonNode node, StringBuilder sb) {
        if (node == null || sb.length() >= WALK_CAP) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                walk(child, sb);
            }
            return;
        }
        JsonNode text = node.get("text");
        if (text != null && text.isTextual()) {
            String value = text.asText();
            if (!value.isEmpty()) {
                if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ') {
                    sb.append(' ');
                }
                sb.append(value);
            }
        }
        walk(node.get("content"), sb);
        walk(node.get("children"), sb);
    }

    private static String normalize(String raw) {
        String text = raw.replaceAll("\\s+", " ").trim();
        if (text.isEmpty()) {
            return null;
        }
        return text.length() > MAX_LEN ? text.substring(0, MAX_LEN).trim() + "…" : text;
    }
}
