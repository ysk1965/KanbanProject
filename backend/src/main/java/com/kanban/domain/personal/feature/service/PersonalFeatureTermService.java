package com.kanban.domain.personal.feature.service;

import com.kanban.domain.personal.feature.PersonalFeatureTerm;
import com.kanban.domain.personal.feature.PersonalFeatureTermRepository;
import com.kanban.domain.personal.feature.dto.PersonalFeatureTermResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 추천 용어 기억.
 *
 * <p>문서 content는 검증되지 않은 Map이다 — 모양이 어긋나면 그 항목만 건너뛰고 절대 던지지 않는다.
 * 추천이 안 되는 것보다 자동 저장이 실패하는 쪽이 훨씬 나쁘다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalFeatureTermService {

    public static final String FEATURE_TIMETABLE = "timetable";

    /** 열당 추천 최대 개수 — 프런트가 문서를 열 때 한 번에 받아 메모리에 둔다. */
    private static final int MAX_PER_FIELD = 300;
    private static final int FIELD_MAX_LENGTH = 60;
    private static final int VALUE_MAX_LENGTH = 300;
    private static final int COLOR_MAX_LENGTH = 16;

    private final PersonalFeatureTermRepository termRepository;

    /** 문서 저장(생성 · content PATCH) 때 호출. 기능별로 값을 뽑는 방법이 다르다. */
    @Transactional
    public void upsertFromContent(String userId, String featureKey, Map<String, Object> content) {
        if (content == null) return;
        Map<TermKey, String> seen;
        try {
            seen = switch (featureKey) {
                case FEATURE_TIMETABLE -> extractTimetableTerms(content);
                default -> Map.of();
            };
        } catch (RuntimeException e) {
            // 추출은 방어적으로 짰지만, 혹시 모를 경우에도 저장 트랜잭션을 깨지 않는다
            log.warn("Feature term extraction skipped (feature={}, user={}): {}", featureKey, userId, e.toString());
            return;
        }
        if (seen.isEmpty()) return;

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        for (Map.Entry<TermKey, String> entry : seen.entrySet()) {
            TermKey key = entry.getKey();
            String color = blankToNull(entry.getValue());
            termRepository.findByUserIdAndFeatureKeyAndFieldAndValue(userId, featureKey, key.field(), key.value())
                    .ifPresentOrElse(
                            term -> term.touch(color, now),
                            () -> termRepository.save(PersonalFeatureTerm.builder()
                                    .userId(userId)
                                    .featureKey(featureKey)
                                    .field(key.field())
                                    .value(key.value())
                                    .color(color)
                                    .useCount(1)
                                    .lastUsedAt(now)
                                    .build()));
        }
    }

    /** field 없으면 전체(열마다 300개씩), 있으면 그 열만. use_count desc · last_used_at desc. */
    public List<PersonalFeatureTermResponse> list(String userId, String featureKey, String field) {
        if (field != null && !field.isBlank()) {
            return termRepository
                    .findByUserIdAndFeatureKeyAndFieldOrderByUseCountDescLastUsedAtDesc(userId, featureKey, field.trim())
                    .stream()
                    .limit(MAX_PER_FIELD)
                    .map(PersonalFeatureTermResponse::of)
                    .toList();
        }
        List<PersonalFeatureTermResponse> result = new ArrayList<>();
        Map<String, Integer> perField = new HashMap<>();
        for (PersonalFeatureTerm term : termRepository
                .findByUserIdAndFeatureKeyOrderByFieldAscUseCountDescLastUsedAtDesc(userId, featureKey)) {
            int taken = perField.merge(term.getField(), 1, Integer::sum);
            if (taken > MAX_PER_FIELD) continue;
            result.add(PersonalFeatureTermResponse.of(term));
        }
        return result;
    }

    /** 추천 항목의 ✕ — 없는 값을 지워도 조용히 지나간다. */
    @Transactional
    public void forget(String userId, String featureKey, String field, String value) {
        if (field == null || value == null) return;
        termRepository.deleteByUserIdAndFeatureKeyAndFieldAndValue(
                userId, featureKey, field.trim(), normalize(value));
    }

    // ───────────────── timetable 추출 ─────────────────

    /**
     * columns[].suggest == true 인 열의 label을 field로, days[].rows[][column.key].t 를 value로.
     * 같은 저장 안에서 같은 (field, value)가 여러 번 나오면 마지막에 본 색을 남긴다.
     */
    private Map<TermKey, String> extractTimetableTerms(Map<String, Object> content) {
        Map<TermKey, String> seen = new LinkedHashMap<>();

        Map<String, String> suggestColumns = new LinkedHashMap<>(); // key → label
        for (Object col : asList(content.get("columns"))) {
            Map<?, ?> column = asMap(col);
            if (column == null || !Boolean.TRUE.equals(column.get("suggest"))) continue;
            String key = asString(column.get("key"));
            String label = asString(column.get("label"));
            if (key == null || label == null) continue;
            label = normalize(label);
            if (label.isEmpty() || label.length() > FIELD_MAX_LENGTH) continue;
            suggestColumns.put(key, label);
        }
        if (suggestColumns.isEmpty()) return seen;

        for (Object dayObj : asList(content.get("days"))) {
            Map<?, ?> day = asMap(dayObj);
            if (day == null) continue;
            for (Object rowObj : asList(day.get("rows"))) {
                Map<?, ?> row = asMap(rowObj);
                if (row == null) continue;
                for (Map.Entry<String, String> column : suggestColumns.entrySet()) {
                    Map<?, ?> cell = asMap(row.get(column.getKey()));
                    if (cell == null) continue;
                    String text = asString(cell.get("t"));
                    if (text == null) continue;
                    String value = normalize(text);
                    if (value.isEmpty() || value.length() > VALUE_MAX_LENGTH) continue;

                    TermKey termKey = new TermKey(column.getValue(), value);
                    if (cell.containsKey("c") && cell.get("c") != null) {
                        String color = asString(cell.get("c"));
                        if (color != null && color.length() <= COLOR_MAX_LENGTH) {
                            seen.put(termKey, color);
                            continue;
                        }
                    }
                    seen.putIfAbsent(termKey, null);
                }
            }
        }
        return seen;
    }

    // ───────────────── helpers ─────────────────

    private record TermKey(String field, String value) {}

    /**
     * trim + 연속 공백을 하나로. 줄바꿈은 유지한다 — 「SJP\n성가대 오케스트라」처럼
     * 두 줄로 쓴 비고를 그대로 추천해야 하기 때문. 프론트 timetableModel.normTerm 과 동일 규칙.
     */
    static String normalize(String s) {
        return s.replace("\r\n", "\n").replace('\r', '\n')
                .trim()
                .replaceAll("[ \\t]+", " ");
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static List<?> asList(Object o) {
        return o instanceof List<?> l ? l : List.of();
    }

    private static Map<?, ?> asMap(Object o) {
        return o instanceof Map<?, ?> m ? m : null;
    }

    private static String asString(Object o) {
        return o instanceof String s ? s : null;
    }
}
