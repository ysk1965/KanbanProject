package com.kanban.domain.meeting.dto;

import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public class MeetingResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private LocalDate meetingDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String memo;
        private String color;
        private UserInfo createdBy;
        private List<ParticipantInfo> participants;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Meeting meeting, List<User> participants) {
            return Detail.builder()
                    .id(meeting.getId())
                    .title(meeting.getTitle())
                    .meetingDate(meeting.getMeetingDate())
                    .startTime(meeting.getStartTime())
                    .endTime(meeting.getEndTime())
                    .memo(meeting.getMemo())
                    .color(meeting.getColor())
                    .createdBy(UserInfo.of(meeting.getCreatedBy()))
                    .participants(participants.stream().map(ParticipantInfo::of).toList())
                    .createdAt(meeting.getCreatedAt())
                    .updatedAt(meeting.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Summary {
        private String id;
        private String title;
        private LocalDate meetingDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private String color;
        private int participantCount;

        public static Summary of(Meeting meeting, int participantCount) {
            return Summary.builder()
                    .id(meeting.getId())
                    .title(meeting.getTitle())
                    .meetingDate(meeting.getMeetingDate())
                    .startTime(meeting.getStartTime())
                    .endTime(meeting.getEndTime())
                    .color(meeting.getColor())
                    .participantCount(participantCount)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MeetingInfo {
        private String id;
        private String title;
        private String color;

        public static MeetingInfo of(Meeting meeting) {
            return MeetingInfo.builder()
                    .id(meeting.getId())
                    .title(meeting.getTitle())
                    .color(meeting.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String profileImage;

        public static UserInfo of(User user) {
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ParticipantInfo {
        private String id;
        private String name;
        private String profileImage;

        public static ParticipantInfo of(User user) {
            return ParticipantInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }
}
