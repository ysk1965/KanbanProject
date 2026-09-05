package com.kanban.domain.imagevote.dto;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class ImageVoteResponse {

    @Getter
    @Builder
    public static class Created {
        private String id;
        private String token;
    }

    @Getter
    @Builder
    public static class Candidate {
        private String id;
        private String imageUrl;
        private String label;
    }

    /** 후보별 집계 — 1위 3점 · 2위 2점 · 3위 1점 */
    @Getter
    @Builder
    public static class CandidateResult {
        private String candidateId;
        private int points;
        private int firstCount;
        private int secondCount;
        private int thirdCount;
    }

    @Getter
    @Builder
    public static class PublicVote {
        private String title;
        private boolean closed;
        private LocalDateTime createdAt;
        private List<Candidate> candidates;
        private long totalBallots;
        private List<CandidateResult> results;
        /** voterKey 쿼리 파라미터로 조회 시 내 기존 투표 (없으면 null) */
        private MyBallot myBallot;
    }

    @Getter
    @Builder
    public static class MyBallot {
        private String voterName;
        private String firstCandidateId;
        private String secondCandidateId;
        private String thirdCandidateId;
    }
}
