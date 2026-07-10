package com.kanban.domain.task;

/**
 * 보드 이름으로부터 사람이 읽는 태스크 키의 프리픽스를 파생한다. (예: "스토리 모드" → "STRMD")
 *
 * <p>규칙: 이름을 순회하며 ASCII 영숫자는 그대로, 한글 음절은 초성을 로마자 1글자로 치환해 최대 5글자를 만든다.
 * 파생 결과가 부실하면(2글자 미만) 기본값 "TASK"로 폴백한다. 유일성(충돌 시 숫자 접미사)은 호출 측
 * {@code TaskKeyAllocator}에서 DB를 조회해 처리한다.
 */
public final class TaskKeyGenerator {

    private TaskKeyGenerator() {}

    private static final String DEFAULT_PREFIX = "TASK";
    private static final int MAX_LEN = 5;

    /** 한글 초성 19자 순서에 대응하는 로마자 1글자. ㅇ(무음)은 빈 문자열. */
    private static final String[] CHOSEONG = {
        "G", "G", "N", "D", "D", "R", "M", "B", "B", "S",
        "S", "", "J", "J", "C", "K", "T", "P", "H"
    };

    public static String derivePrefix(String name) {
        if (name == null || name.isBlank()) {
            return DEFAULT_PREFIX;
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < name.length() && sb.length() < MAX_LEN; i++) {
            char c = name.charAt(i);
            if (c >= '0' && c <= '9') {
                sb.append(c);
            } else if (c >= 'A' && c <= 'Z') {
                sb.append(c);
            } else if (c >= 'a' && c <= 'z') {
                sb.append(Character.toUpperCase(c));
            } else if (c >= 0xAC00 && c <= 0xD7A3) {
                // 한글 음절 → 초성 로마자
                int choseongIndex = (c - 0xAC00) / 588;
                sb.append(CHOSEONG[choseongIndex]);
            }
            // 그 외(공백/기호/기타 문자)는 건너뛴다
        }

        // 프리픽스는 글자로 시작하도록 앞쪽 숫자를 제거
        int start = 0;
        while (start < sb.length() && Character.isDigit(sb.charAt(start))) {
            start++;
        }
        String result = sb.substring(start);

        if (result.length() < 2) {
            return DEFAULT_PREFIX;
        }
        return result.length() > MAX_LEN ? result.substring(0, MAX_LEN) : result;
    }
}
