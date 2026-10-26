package com.kanban.domain.sermongroup.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

/**
 * 모임 API 응답. Jackson SNAKE_CASE + non_null — null 필드는 키가 빠진다(invite_code, my_share_id, fields …).
 */
public class SermonGroupResponse {

    /** GroupSummary / GroupDetail — 목록과 상세가 같은 모양 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String kind;
        private Integer meetDow;
        private String meetTime;
        private List<Map<String, Object>> services;
        private boolean joinApproval;
        /** 리더·함께 리더에게만 */
        private String inviteCode;

        private LocalDateTime inviteExpiresAt;
        private Me me;
        /** active 멤버 (+ 리더·함께 리더에게는 pending). 승인 대기 중인 본인에게는 빈 목록 */
        private List<Member> members;

        private long memberCount;
        private LocalDateTime createdAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Me {
        private String userId;
        private String role;
        private String status;
        private String displayName;
        private List<String> mutedServiceIds;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Member {
        private String userId;
        private String displayName;
        private String role;
        private String status;
        private String profileImage;
    }

    /** GET /sermon-groups/invite/{code} — 멤버 노트·이름 목록은 넣지 않는다 */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class InvitePreview {
        private String groupId;
        private String name;
        private String kind;
        private Integer meetDow;
        private String meetTime;
        private List<Map<String, Object>> services;
        private String leaderName;
        private long memberCount;
        private boolean joinApproval;
        private List<PreviewSession> thisWeek;
        /** null(비로그인·비멤버) | pending | active */
        private String myStatus;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PreviewSession {
        private String serviceId;
        private LocalDate date;
        private String name;
        private String title;
        private List<String> refs;
        private long recordedCount;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SessionSummary {
        private String id;
        private String serviceId;
        private LocalDate date;
        private String name;
        private String title;
        private String preacher;
        private List<String> refs;
        private boolean locked;
        private String updatedByName;
        /** 기록한 사람만. 없는 사람 = 아직 */
        private List<SessionMember> members;

        private String myShareId;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SessionMember {
        private String userId;
        /** written | private */
        private String state;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Week {
        private List<SessionSummary> sessions;
        private List<PokeForMe> pokesForMe;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PokeForMe {
        private String fromName;
        private LocalDateTime createdAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SessionDetail {
        private SessionSummary session;
        private List<ShareView> shares;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ShareView {
        private String id;
        private String userId;
        private String displayName;
        private String myTitle;
        private String heard;
        private String part;

        @JsonProperty("private")
        private boolean isPrivate;

        /** private 면 null(키 생략) */
        private Map<String, Object> fields;

        private LocalDateTime updatedAt;
        private List<ReactionCount> reactions;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ReactionCount {
        private String itemKey;
        private String kind;
        private long count;
        private boolean mine;
    }
}
