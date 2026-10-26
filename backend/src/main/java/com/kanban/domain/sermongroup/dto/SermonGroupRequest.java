package com.kanban.domain.sermongroup.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 모임 API 요청 본문. 검증은 서비스가 SG010 으로 한다(@Valid 의 C001 과 섞지 않는다).
 *
 * <p>PATCH /sermon-groups/{id} 는 null 로 지우기(meet_dow · meet_time)가 있어 JsonNode 로 받는다 — 여기 없음.
 */
public class SermonGroupRequest {

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Create {
        private String name;
        private String kind;
        private Integer meetDow;
        private String meetTime;
        private List<Map<String, Object>> services;
        private Boolean joinApproval;
        private String displayName;
        /** 7 | 30 | null(무기한) */
        private Integer inviteExpiresDays;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Invite {
        /** 7 | 30 | null(무기한) */
        private Integer expiresDays;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Join {
        private String displayName;
        private List<String> mutedServiceIds;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class UpdateMe {
        private String displayName;
        private List<String> mutedServiceIds;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class ChangeRole {
        private String role;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Poke {
        private String toUserId;
        private String sessionId;
        private LocalDate weekStart;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class OpenSession {
        private String name;
        private LocalDate date;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class ResolveSession {
        private String groupId;
        private String serviceId;
        private LocalDate date;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class UpdateSession {
        private String title;
        private String preacher;
        private List<String> refs;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Lock {
        private Boolean locked;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Share {
        private String noteId;
        private String myTitle;
        private String heard;
        private String part;

        @JsonProperty("private")
        private Boolean isPrivate;

        private Map<String, Object> fields;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Reaction {
        private String itemKey;
        private String kind;
    }
}
