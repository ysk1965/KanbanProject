package com.kanban.domain.talent.service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 설교 노트 content(JSON) 에서 달란트 계산에 필요한 사실만 뽑는다. 모양은 프런트 sermonTypes.ts 의 SermonNote.
 *
 * <p>모르는 값·깨진 값은 조건 불충족으로 본다(예외를 던지지 않는다).
 */
public record SermonNoteFacts(
        String title,
        LocalDate date,
        int bodyTextLength,
        List<Thought> thoughts,
        double audioSeconds,
        boolean audioUploaded,
        Long bookmarkedAt) {

    public static final String TAG_APPLY = "적용";
    public static final int NOTE_BODY_MIN = 100;
    public static final int NOTE_THOUGHTS_MIN = 2;
    public static final double AUDIO_MIN_SECONDS = 600;
    public static final int APPLY_TEXT_MIN = 10;
    public static final long APPLY_DONE_MIN_MS = 12L * 60 * 60 * 1000;

    private static final String LOCAL_ID_PREFIX = "local-";
    private static final Pattern TAGS = Pattern.compile("<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    public record Thought(String id, String tag, int textLength, boolean done, Long doneAt, Long at) {
        public boolean isApply() {
            return TAG_APPLY.equals(tag);
        }

        /** 적용 기록 +3: 적용 태그 · 10자 이상 */
        public boolean qualifiesApply() {
            return isApply() && textLength >= APPLY_TEXT_MIN;
        }

        /** 적용 실천 +10: 적용 태그 · done · done_at - at ≥ 12시간 */
        public boolean qualifiesDone() {
            return isApply() && done && doneAt != null && at != null && doneAt - at >= APPLY_DONE_MIN_MS;
        }
    }

    /** note +20: 본문 100자 이상 또는 생각 2개 이상 또는 녹음 10분 이상 */
    public boolean qualifiesNote() {
        long filled = thoughts.stream().filter(t -> t.textLength() > 0).count();
        return bodyTextLength >= NOTE_BODY_MIN || filled >= NOTE_THOUGHTS_MIN || audioSeconds >= AUDIO_MIN_SECONDS;
    }

    /** note_audio +5: 녹음 합계 600초 이상 + 올라간 토막이 있음 */
    public boolean qualifiesAudio() {
        return audioSeconds >= AUDIO_MIN_SECONDS && audioUploaded;
    }

    public static SermonNoteFacts from(Map<String, Object> content, String fallbackTitle) {
        if (content == null) content = Map.of();
        String title = str(content.get("title"));
        if (title == null || title.isBlank()) title = fallbackTitle;

        LocalDate date = null;
        String ds = str(content.get("date"));
        if (ds != null) {
            try {
                date = LocalDate.parse(ds);
            } catch (DateTimeParseException ignored) {
                // 날짜가 깨졌으면 없는 것으로
            }
        }

        List<Thought> thoughts = new ArrayList<>();
        if (content.get("thoughts") instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String id = str(m.get("id"));
                if (id == null) continue;
                String text = str(m.get("text"));
                thoughts.add(new Thought(
                        id,
                        str(m.get("tag")),
                        text == null
                                ? 0
                                : text.strip().codePointCount(0, text.strip().length()),
                        Boolean.TRUE.equals(m.get("done")),
                        num(m.get("done_at")),
                        num(m.get("at"))));
            }
        }

        double audioSeconds = 0;
        boolean uploaded = false;
        if (content.get("audio") instanceof Map<?, ?> audio && audio.get("segments") instanceof List<?> segs) {
            for (Object o : segs) {
                if (!(o instanceof Map<?, ?> s)) continue;
                if (s.get("duration") instanceof Number d && d.doubleValue() > 0) audioSeconds += d.doubleValue();
                String id = str(s.get("id"));
                if (id != null && !id.startsWith(LOCAL_ID_PREFIX) && !Boolean.TRUE.equals(s.get("lost"))) {
                    uploaded = true;
                }
            }
        }

        return new SermonNoteFacts(
                title,
                date,
                bodyTextLength(str(content.get("body"))),
                thoughts,
                audioSeconds,
                uploaded,
                num(content.get("bookmarked_at")));
    }

    /** HTML 태그를 지우고 엔티티를 풀고 공백을 하나로 접은 뒤 글자 수(코드 포인트) */
    static int bodyTextLength(String html) {
        if (html == null || html.isEmpty()) return 0;
        String text = TAGS.matcher(html)
                .replaceAll(" ")
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&amp;", "&");
        text = SPACES.matcher(text).replaceAll(" ").strip();
        return text.codePointCount(0, text.length());
    }

    private static String str(Object o) {
        return o instanceof String s ? s : null;
    }

    private static Long num(Object o) {
        return o instanceof Number n ? n.longValue() : null;
    }
}
