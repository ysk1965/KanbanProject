package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteExcerptExtractor;
import com.kanban.domain.note.dto.NoteResponse;

import java.util.Locale;

/**
 * 노트 검색의 스코프 무관 공통 로직: 질의 정규화, LIKE 패턴, 결과 DTO(스니펫) 생성.
 * 보드/조직/개인 서비스가 같은 코드를 쓴다.
 */
public final class NoteSearchSupport {

    private NoteSearchSupport() {}

    public static final int MIN_QUERY_LEN = 2;
    public static final int MAX_RESULTS = 30;
    static final int EXCERPT_LEN = 140;

    /** trim + 소문자. 2자 미만이면 null (검색하지 않음). */
    public static String normalizeQuery(String raw) {
        if (raw == null) return null;
        String q = raw.trim();
        if (q.length() < MIN_QUERY_LEN) return null;
        return q.toLowerCase(Locale.ROOT);
    }

    /** JPQL {@code LIKE :pattern ESCAPE '!'} 용 패턴. 사용자 입력의 % _ ! 를 이스케이프한다. */
    public static String likePattern(String normalizedQuery) {
        String escaped = normalizedQuery
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }

    public static NoteResponse.SearchResult toResult(Note note, String normalizedQuery) {
        String title = note.getTitle() != null ? note.getTitle() : "";
        boolean titleMatch = title.toLowerCase(Locale.ROOT).contains(normalizedQuery);

        String plain = note.isDocument() ? NoteExcerptExtractor.toPlainText(note.getContent()) : null;
        int idx = plain != null ? plain.toLowerCase(Locale.ROOT).indexOf(normalizedQuery) : -1;

        String matchIn = titleMatch ? "title" : "content";
        String excerpt = snippet(plain, idx, normalizedQuery.length());
        return NoteResponse.SearchResult.of(note, excerpt, matchIn);
    }

    /**
     * 평문에서 첫 매치를 가운데 둔 약 140자 스니펫. 매치가 없으면 앞 140자. 평문이 없으면 null.
     * 잘린 쪽에는 "…" 를 붙인다.
     */
    static String snippet(String plain, int matchIdx, int matchLen) {
        if (plain == null || plain.isEmpty()) return null;
        if (plain.length() <= EXCERPT_LEN) return plain;

        int start;
        if (matchIdx < 0) {
            start = 0;
        } else {
            start = matchIdx - (EXCERPT_LEN - matchLen) / 2;
            start = Math.max(0, Math.min(start, plain.length() - EXCERPT_LEN));
        }
        int end = Math.min(plain.length(), start + EXCERPT_LEN);

        // 단어 경계로 살짝 당기기 (앞쪽만; 뒤쪽은 그대로 잘라도 무방)
        if (start > 0) {
            int sp = plain.indexOf(' ', start);
            if (sp >= 0 && sp - start < 20) start = sp + 1;
        }

        String out = plain.substring(start, end).trim();
        if (start > 0) out = "…" + out;
        if (end < plain.length()) out = out + "…";
        return out;
    }
}
