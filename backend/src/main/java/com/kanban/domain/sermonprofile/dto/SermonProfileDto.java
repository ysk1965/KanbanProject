package com.kanban.domain.sermonprofile.dto;

import java.time.LocalDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 「나의 갈피」 이름표 API. JSON 은 snake_case + non_null (null 필드는 키가 빠진다). 계약: docs/Tech/sermon-profile-api.md */
public class SermonProfileDto {

    /** 고정한 노트 한 장. ink 는 표지 색(잉크 id), pattern 은 dots/lines/stars/plain, sticker 는 mascot/none */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Pin {
        private String noteId;
        private String ink;
        private String pattern;
        private String sticker;
        private String line;
    }

    /** PUT /sermon-profile/me — 통째로 바꾼다 (빠진 필드는 기본값/비움) */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class Update {
        private String mascot;
        private String mascotState;
        private String ink;
        private String verseRef;
        private String verseStyle;
        private String visibility;
        private List<Pin> pins;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class VerseEntry {
        private String verseRef;
        private LocalDateTime fromAt;
        private LocalDateTime toAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Profile {
        private String userId;
        private String displayName;
        /** false = 아직 저장한 적 없음 (기본값으로 채워 돌려줌) */
        private boolean saved;

        private String mascot;
        private String mascotState;
        private String ink;
        private String verseRef;
        private String verseStyle;
        private String visibility;
        /** 소속 교회 — 챌린지 user_churches 를 읽어 온다 (없으면 키 없음) */
        private ChurchRef church;
        /** 본인 조회에만 */
        private List<Pin> pins;
        /** 본인 조회에만 — 최근 12개, 최신 순 */
        private List<VerseEntry> verseHistory;
        /** 지금 대표 말씀이 몇 번째인지 (1부터). 본인 조회에만 */
        private Long verseCount;

        private LocalDateTime updatedAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChurchRef {
        private String id;
        private String name;
        private String region;
        private String dept;
    }
}
