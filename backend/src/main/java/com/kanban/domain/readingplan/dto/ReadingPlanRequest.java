package com.kanban.domain.readingplan.dto;

import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 통독 API 요청 본문. 날짜는 문자열로 받아 서비스가 검증한다 — 형식이 틀리면 RP001(today) · RP002(days) 로 답하려고.
 */
public class ReadingPlanRequest {

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Create {
        /** 생략 = 나의 길 */
        private String groupId;

        private String title;
        private String template;
        private List<Day> days;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Day {
        private String date;
        private List<String> chapters;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class StampChapter {
        private String chapter;
        private String today;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class ManualCheck {
        private Boolean checked;
        private String today;
    }
}
