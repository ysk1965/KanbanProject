package com.kanban.domain.calendar.dto;

import com.kanban.domain.calendar.CalendarEvent;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class CalendarEventResponse {

    @Getter
    @AllArgsConstructor
    @Builder
    public static class Item {
        private String id;
        private String eventType;   // BUILD / VACATION / HOLIDAY ...
        private String category;    // TEAM / MEMBER / CALENDAR
        private MemberInfo member;  // MEMBER 카테고리일 때만 non-null
        private String title;
        private LocalDate startDate;
        private LocalDate endDate;
        private String color;
        private boolean recurring;
        private LocalDateTime createdAt;

        public static Item of(CalendarEvent e) {
            return Item.builder()
                    .id(e.getId())
                    .eventType(e.getEventType().name())
                    .category(e.getEventType().category().name())
                    .member(MemberInfo.of(e.getMember()))
                    .title(e.getTitle())
                    .startDate(e.getStartDate())
                    .endDate(e.getEndDate())
                    .color(e.getColor())
                    .recurring(Boolean.TRUE.equals(e.getRecurring()))
                    .createdAt(e.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class MemberInfo {
        private String id;
        private String name;
        private String profileImage;

        public static MemberInfo of(User user) {
            if (user == null) {
                return null;
            }
            return MemberInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class ListResponse {
        private List<Item> events;

        public static ListResponse of(List<CalendarEvent> events) {
            return new ListResponse(events.stream().map(Item::of).toList());
        }
    }
}
