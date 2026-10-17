package com.kanban.domain.imagevote.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

public class ImageVoteRequest {

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Create {
        @NotBlank
        @Size(max = 200)
        private String title;

        @NotEmpty
        @Size(min = 3, max = 50)
        @Valid
        private List<Candidate> candidates;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Candidate {
        @Size(max = 64)
        private String nodeId;

        @NotBlank
        private String imageUrl;

        @Size(max = 200)
        private String label;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Ballot {
        @NotBlank
        @Size(max = 100)
        private String voterName;

        @NotBlank
        @Size(max = 64)
        private String voterKey;

        @NotBlank
        private String firstCandidateId;

        @NotBlank
        private String secondCandidateId;

        @NotBlank
        private String thirdCandidateId;
    }
}
