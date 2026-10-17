package com.kanban.domain.personal.feature.dto;

import com.kanban.domain.personal.feature.PersonalFeatureTerm;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
@AllArgsConstructor
public class PersonalFeatureTermResponse {
    private String field;
    private String value;
    private String color;
    private Integer useCount;
    private LocalDateTime lastUsedAt;

    public static PersonalFeatureTermResponse of(PersonalFeatureTerm term) {
        return PersonalFeatureTermResponse.builder()
                .field(term.getField())
                .value(term.getValue())
                .color(term.getColor())
                .useCount(term.getUseCount())
                .lastUsedAt(term.getLastUsedAt())
                .build();
    }
}
