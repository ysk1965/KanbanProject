package com.kanban.domain.board;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 보드 화면의 직교 옵션 — 레벨(시간 묶음 깊이)과 무관하게 1·2·3 어디서나 켜고 끈다.
 *
 * <p>레벨이 사다리(주기 없이 단계만 쓸 수 없다)인 것과 달리 이쪽은 순서가 없다.
 * 성격이 다르므로 저장도 {@code boards.ui_level}과 {@code boards.ui_options}로 나눠 둔다.
 *
 * <p>흐름 컬럼 중 {@code Done}은 여기 없다 — 끌 수 없는 필수 구조라서다.
 * 끝난 일이 갈 곳이 없으면 묶음 컬럼이 무한정 길어진다.
 */
public enum UiOption {
    /** 구성원별 보기 — 컬럼을 사람으로 세운다. */
    MEMBERS("members"),
    /** In Review 컬럼 — 끄면 진행 → 완료 두 칸이 된다. */
    REVIEW("review"),
    /** 개인 시간 블록 — 할 일 줄마다 개인 캘린더의 시간. */
    TIMEBLOCK("timeblock"),
    /** JIRA 연동 뷰. */
    JIRA("jira");

    private final String key;

    UiOption(String key) {
        this.key = key;
    }

    public String key() {
        return this.key;
    }

    /** 신규 보드 기본값 — JIRA는 연동을 붙일 때 켜므로 제외한다. */
    public static String defaultOptions() {
        return MEMBERS.key + "," + REVIEW.key + "," + TIMEBLOCK.key;
    }

    /**
     * 쉼표 문자열 → 옵션 집합. 모르는 키는 조용히 버린다.
     * 클라이언트가 새 키를 먼저 보내도 서버가 500을 내지 않게 하기 위함이다.
     */
    public static Set<UiOption> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return new LinkedHashSet<>();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(UiOption::fromKeyOrNull)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** 집합 → 저장 문자열. enum 선언 순서로 정규화해 같은 조합이 항상 같은 문자열이 되게 한다. */
    public static String serialize(Set<UiOption> options) {
        if (options == null || options.isEmpty()) {
            return "";
        }
        return Arrays.stream(values())
                .filter(options::contains)
                .map(UiOption::key)
                .collect(Collectors.joining(","));
    }

    /** 화이트리스트 검증 겸 정규화 — 저장 전에 한 번 통과시킨다. */
    public static String sanitize(String raw) {
        return serialize(parse(raw));
    }

    private static UiOption fromKeyOrNull(String key) {
        for (UiOption o : values()) {
            if (o.key.equals(key)) {
                return o;
            }
        }
        return null;
    }
}
