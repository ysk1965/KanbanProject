package com.kanban.domain.mentiongroup.dto;

import com.kanban.domain.mentiongroup.MentionGroup;
import com.kanban.domain.mentiongroup.MentionGroupMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class MentionGroupResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberInfo {
        private String userId;
        private String name;
        private String profileImage;

        public static MemberInfo of(MentionGroupMember mgm) {
            return MemberInfo.builder()
                    .userId(mgm.getUser().getId())
                    .name(mgm.getUser().getName())
                    .profileImage(mgm.getUser().getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private List<MemberInfo> members;
        private LocalDateTime createdAt;

        public static Detail of(MentionGroup group) {
            return Detail.builder()
                    .id(group.getId())
                    .name(group.getName())
                    .members(group.getMembers().stream()
                            .map(MemberInfo::of)
                            .toList())
                    .createdAt(group.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> groups;

        public static ListResponse of(List<MentionGroup> groups) {
            return ListResponse.builder()
                    .groups(groups.stream().map(Detail::of).toList())
                    .build();
        }
    }
}
