package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.*;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class OneOnOneResponse {

    @Getter
    @Builder
    public static class Summary {
        private String id;
        private MemberInfo memberA;
        private MemberInfo memberB;
        private String recurrenceType;
        private Integer recurrenceDay;
        private LocalDate nextMeetingDate;
        private boolean active;
        private long meetingCount;
        private LocalDateTime createdAt;

        public static Summary from(OrgOneOnOne o, long meetingCount) {
            return Summary.builder()
                    .id(o.getId())
                    .memberA(MemberInfo.from(o.getMemberA()))
                    .memberB(MemberInfo.from(o.getMemberB()))
                    .recurrenceType(o.getRecurrenceType() != null ? o.getRecurrenceType().name() : null)
                    .recurrenceDay(o.getRecurrenceDay())
                    .nextMeetingDate(o.getNextMeetingDate())
                    .active(o.isActive())
                    .meetingCount(meetingCount)
                    .createdAt(o.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class MemberInfo {
        private String id;
        private String userId;
        private String name;
        private String profileImageUrl;
        private String jobTitle;
        private String departmentName;

        public static MemberInfo from(OrganizationMember m) {
            return MemberInfo.builder()
                    .id(m.getId())
                    .userId(m.getUser().getId())
                    .name(m.getUser().getName())
                    .profileImageUrl(m.getUser().getProfileImage())
                    .jobTitle(m.getJobTitle())
                    .departmentName(m.getDepartment() != null ? m.getDepartment().getName() : null)
                    .build();
        }
    }

    @Getter
    @Builder
    public static class MeetingDetail {
        private String id;
        private LocalDate meetingDate;
        private String agenda;
        private String notes;
        private List<ActionItemDetail> actionItems;
        private String createdByName;
        private LocalDateTime createdAt;

        public static MeetingDetail from(OrgOneOnOneMeeting m) {
            return MeetingDetail.builder()
                    .id(m.getId())
                    .meetingDate(m.getMeetingDate())
                    .agenda(m.getAgenda())
                    .notes(m.getNotes())
                    .actionItems(m.getActionItems().stream()
                            .map(ActionItemDetail::from)
                            .toList())
                    .createdByName(m.getCreatedBy().getName())
                    .createdAt(m.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class MeetingListResponse {
        private List<MeetingDetail> meetings;
        private String nextCursor;
        private boolean hasMore;
    }

    @Getter
    @Builder
    public static class ActionItemDetail {
        private String id;
        private String title;
        private String assigneeId;
        private String assigneeName;
        private boolean completed;
        private LocalDateTime completedAt;
        private int displayOrder;

        public static ActionItemDetail from(OrgOneOnOneActionItem ai) {
            return ActionItemDetail.builder()
                    .id(ai.getId())
                    .title(ai.getTitle())
                    .assigneeId(ai.getAssignee() != null ? ai.getAssignee().getId() : null)
                    .assigneeName(ai.getAssignee() != null ? ai.getAssignee().getUser().getName() : null)
                    .completed(ai.isCompleted())
                    .completedAt(ai.getCompletedAt())
                    .displayOrder(ai.getDisplayOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class OpenActionItem {
        private String id;
        private String title;
        private String assigneeName;
        private LocalDate meetingDate;
        private LocalDateTime createdAt;

        public static OpenActionItem from(OrgOneOnOneActionItem ai) {
            return OpenActionItem.builder()
                    .id(ai.getId())
                    .title(ai.getTitle())
                    .assigneeName(ai.getAssignee() != null ? ai.getAssignee().getUser().getName() : null)
                    .meetingDate(ai.getMeeting().getMeetingDate())
                    .createdAt(ai.getCreatedAt())
                    .build();
        }
    }
}
