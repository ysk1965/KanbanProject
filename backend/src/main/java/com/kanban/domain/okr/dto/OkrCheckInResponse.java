package com.kanban.domain.okr.dto;

import com.kanban.domain.okr.OkrCheckIn;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OkrCheckInResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String keyResultId;
        private double previousValue;
        private double newValue;
        private String confidence;
        private String note;
        private OkrObjectiveResponse.MemberInfo author;
        private LocalDateTime createdAt;

        public static Detail of(OkrCheckIn checkIn) {
            return Detail.builder()
                    .id(checkIn.getId())
                    .keyResultId(checkIn.getKeyResult().getId())
                    .previousValue(checkIn.getPreviousValue())
                    .newValue(checkIn.getNewValue())
                    .confidence(checkIn.getConfidence())
                    .note(checkIn.getNote())
                    .author(OkrObjectiveResponse.MemberInfo.of(checkIn.getAuthor()))
                    .createdAt(checkIn.getCreatedAt())
                    .build();
        }
    }
}
