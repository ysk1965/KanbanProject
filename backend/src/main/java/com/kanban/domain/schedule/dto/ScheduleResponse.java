package com.kanban.domain.schedule.dto;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public class ScheduleResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DailySchedule {
        private LocalDate date;
        private SettingsInfo settings;
        private List<ColumnInfo> columns;
    }

    /**
     * 주간 스케줄 응답 DTO
     * 7개 API 호출 → 1개로 통합
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklySchedule {
        private LocalDate startDate;
        private LocalDate endDate;
        private SettingsInfo settings;
        private List<DayData> days;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DayData {
        private LocalDate date;
        private List<ColumnInfo> columns;
    }

    /**
     * Day 모드 통합 응답 DTO
     * 스케줄 + 데일리 체크리스트 (2개 API 호출 → 1개)
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class DailyFull {
        private LocalDate date;
        private SettingsInfo settings;
        private List<ColumnInfo> columns;  // 스케줄 블록
        private List<DailyChecklistColumnInfo> dailyChecklists;  // 데일리 체크리스트
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DailyChecklistColumnInfo {
        private UserInfo user;
        private List<DailyChecklistItemInfo> items;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DailyChecklistItemInfo {
        private String id;
        private String checklistItemId;
        private String title;
        private UserInfo assignee;
        private LocalDate assignedDate;
        private Integer position;
        private Boolean completed;
        private TaskInfo task;
        private FeatureInfo feature;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SettingsInfo {
        private Integer workHoursPerDay;
        private LocalTime workStartTime;
        private String scheduleDisplayMode;
        private LocalTime breakStartTime;
        private LocalTime breakEndTime;

        public static SettingsInfo of(Board board) {
            return SettingsInfo.builder()
                    .workHoursPerDay(board.getWorkHoursPerDay())
                    .workStartTime(board.getWorkStartTime())
                    .scheduleDisplayMode(board.getScheduleDisplayMode())
                    .breakStartTime(board.getBreakStartTime())
                    .breakEndTime(board.getBreakEndTime())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ColumnInfo {
        private UserInfo user;
        private List<BlockInfo> blocks;
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
    public static class BlockInfo {
        private String id;
        private LocalTime startTime;
        private LocalTime endTime;
        private ChecklistItemInfo checklistItem;
        private TaskInfo task;
        private FeatureInfo feature;
        private MeetingResponse.MeetingInfo meeting;

        public static BlockInfo of(ScheduleBlock block) {
            ChecklistItem item = block.getChecklistItem();
            Task task = item != null ? item.getTask() : null;
            Feature feature = task != null ? task.getFeature() : null;
            Meeting meeting = block.getMeeting();

            return BlockInfo.builder()
                    .id(block.getId())
                    .startTime(block.getStartTime())
                    .endTime(block.getEndTime())
                    .checklistItem(item != null ? ChecklistItemInfo.of(item) : null)
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .meeting(meeting != null ? MeetingResponse.MeetingInfo.of(meeting) : null)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChecklistItemInfo {
        private String id;
        private String title;
        private boolean completed;
        private LocalDate startDate;
        private LocalDate dueDate;

        public static ChecklistItemInfo of(ChecklistItem item) {
            return ChecklistItemInfo.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TaskInfo {
        private String id;
        private String title;

        public static TaskInfo of(Task task) {
            return TaskInfo.builder()
                    .id(task.getId())
                    .title(task.getTitle())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class FeatureInfo {
        private String id;
        private String title;
        private String color;

        public static FeatureInfo of(Feature feature) {
            return FeatureInfo.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BlockDetail {
        private String id;
        private String assigneeId;
        private LocalDate scheduledDate;
        private LocalTime startTime;
        private LocalTime endTime;
        private ChecklistItemInfo checklistItem;
        private TaskInfo task;
        private FeatureInfo feature;
        private MeetingResponse.MeetingInfo meeting;

        public static BlockDetail of(ScheduleBlock block) {
            ChecklistItem item = block.getChecklistItem();
            Task task = item != null ? item.getTask() : null;
            Feature feature = task != null ? task.getFeature() : null;
            Meeting meeting = block.getMeeting();

            return BlockDetail.builder()
                    .id(block.getId())
                    .assigneeId(block.getAssignee().getId())
                    .scheduledDate(block.getScheduledDate())
                    .startTime(block.getStartTime())
                    .endTime(block.getEndTime())
                    .checklistItem(item != null ? ChecklistItemInfo.of(item) : null)
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .meeting(meeting != null ? MeetingResponse.MeetingInfo.of(meeting) : null)
                    .build();
        }
    }
}
