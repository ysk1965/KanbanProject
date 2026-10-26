package com.kanban.domain.talent;

import java.util.Set;

/** 원장 reason 값(계약서 표 그대로). activity_log 와 무관한 문자열이라 enum CHECK 제약이 없다. */
public final class TalentReason {

    public static final String NOTE = "note";
    public static final String NOTE_AUDIO = "note_audio";
    public static final String APPLY = "apply";
    public static final String APPLY_DONE = "apply_done";
    public static final String GALPI = "galpi";
    public static final String WEEK_COMPLETE = "week_complete";
    public static final String STREAK = "streak";
    public static final String GAME = "game";
    public static final String GAME_FIRST = "game_first";
    public static final String EXCHANGE = "exchange";

    /** 하루 30 상한에 함께 묶이는 사유 */
    public static final Set<String> GAME_REASONS = Set.of(GAME, GAME_FIRST);

    /** 랭킹 점수에 더하지 않는 사유 */
    public static final Set<String> NOT_FOR_RANK = Set.of(STREAK, EXCHANGE);

    private TalentReason() {}
}
