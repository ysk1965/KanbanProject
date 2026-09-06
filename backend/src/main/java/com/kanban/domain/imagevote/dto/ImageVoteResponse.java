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
        /** 투표용 토큰 */
        private String token;
        /** 결과 조회·종료용 관리 토큰 */
        private String adminToken;
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

    /** 관리 토큰으로 조회하는 결과 뷰 — 공개 결과 + 투표자별 선택 내역 + 투표 링크 토큰 */
    @Getter
    @Builder
    public static class AdminVote {
        private String title;
        private boolean closed;
        private LocalDateTime createdAt;
        private LocalDateTime closedAt;
        /** 투표용 공개 토큰 (투표 링크 재복사용) */
        private String token;
        private List<Candidate> candidates;
        private long totalBallots;
        private List<CandidateResult> results;
        private List<BallotDetail> ballots;
    }

    @Getter
    @Builder
    public static class BallotDetail {
        private String voterName;
        private String firstCandidateId;
        private String secondCandidateId;
        private String thirdCandidateId;
        private LocalDateTime votedAt;
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
