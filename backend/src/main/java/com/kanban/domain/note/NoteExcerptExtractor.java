package com.kanban.domain.note;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Locale;

/**
 * 노트 본문에서 평문을 추출한다. 링크 미리보기(og:description)용 발췌와
 * 전문 검색용 search_text 생성이 모두 이 로직을 쓴다.
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

    /** search_text 최대 길이. 초과분은 잘라낸다 (인덱스·행 크기 보호). */
    public static final int SEARCH_TEXT_MAX_LEN = 200_000;

    /** @return 평문 발췌(최대 180자, 초과 시 … 부가) 또는 발췌 불가 시 null */
    public static String extract(String content, NoteType type) {
        if (type == NoteType.BOARD) {
            return null;
        }
        String text = toPlainText(content, WALK_CAP);
        if (text == null) {
            return null;
        }
        return text.length() > MAX_LEN ? text.substring(0, MAX_LEN).trim() + "…" : text;
    }

    /**
     * 본문 전체를 평문으로 변환한다 (길이 제한 없음, 공백 정규화).
     * BlockNote JSON / 레거시 HTML 만 지원하며, 화이트보드 JSON({)·빈 본문·파싱 실패는 null.
     */
    public static String toPlainText(String content) {
        return toPlainText(content, Integer.MAX_VALUE);
    }

    /**
     * 전문 검색용 텍스트: {@code lowercase(title + "\n" + plainText(content))}.
     * 폴더·화이트보드는 제목만. 결과는 절대 null 이 아니며 {@link #SEARCH_TEXT_MAX_LEN} 으로 잘린다.
     */
    public static String buildSearchText(String title, String content, NoteType type) {
        StringBuilder sb = new StringBuilder();
        if (title != null) {
            sb.append(title.trim());
        }
        if (type == NoteType.DOCUMENT) {
            String body = toPlainText(content);
            if (body != null) {
                sb.append('\n').append(body);
            }
        }
        String text = sb.toString().toLowerCase(Locale.ROOT);
        return text.length() > SEARCH_TEXT_MAX_LEN ? text.substring(0, SEARCH_TEXT_MAX_LEN) : text;
    }

    private static String toPlainText(String content, int cap) {
        if (content == null || content.isBlank()) {
            return null;
        }
        String head = content.stripLeading();
        try {
            if (head.startsWith("[")) {
                StringBuilder sb = new StringBuilder();
                walk(MAPPER.readTree(content), sb, cap);
                return normalize(sb.toString());
            }
            if (head.startsWith("<")) {
                String text = content
                        .replaceAll("<[^>]+>", " ")
                        .replace("&nbsp;", " ")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&quot;", "\"")
                        .replace("&#39;", "'");
                return normalize(text);
            }
        } catch (Exception e) {
            return null; // 파싱 실패 시 발췌 없이 진행
        }
        return null;
    }

    /** BlockNote 노드를 재귀 순회하며 모든 text 필드를 모은다. */
    private static void walk(JsonNode node, StringBuilder sb, int cap) {
        if (node == null || sb.length() >= cap) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                walk(child, sb, cap);
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
        walk(node.get("content"), sb, cap);
        walk(node.get("children"), sb, cap);
    }

    private static String normalize(String raw) {
        String text = raw.replaceAll("\\s+", " ").trim();
        return text.isEmpty() ? null : text;
    }
}
