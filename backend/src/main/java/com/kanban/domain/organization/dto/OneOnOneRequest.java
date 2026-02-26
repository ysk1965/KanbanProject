package com.kanban.domain.organization.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
public class OneOnOneRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank
        private String memberBId;
        private String recurrenceType;
        private Integer recurrenceDay;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        private String recurrenceType;
        private Integer recurrenceDay;
        private String nextMeetingDate;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateMeeting {
        @NotNull
        private String meetingDate;
        private String agenda;
        private String notes;
        @Valid
        private List<ActionItemInput> actionItems;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateMeeting {
        private String meetingDate;
        private String agenda;
        private String notes;
        @Valid
        private List<ActionItemInput> actionItems;
    }

    @Getter
    @NoArgsConstructor
    public static class ActionItemInput {
        @NotBlank
        @Size(max = 300)
        private String title;
        private String assigneeId;
    }
}
