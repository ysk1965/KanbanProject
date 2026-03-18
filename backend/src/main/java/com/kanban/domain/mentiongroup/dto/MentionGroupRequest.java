package com.kanban.domain.mentiongroup.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class MentionGroupRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "그룹 이름은 필수입니다")
        @Size(max = 50, message = "그룹 이름은 50자 이내여야 합니다")
        private String name;

        @NotEmpty(message = "멤버를 1명 이상 선택해야 합니다")
        private List<String> memberIds;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @NotBlank(message = "그룹 이름은 필수입니다")
        @Size(max = 50, message = "그룹 이름은 50자 이내여야 합니다")
        private String name;

        @NotEmpty(message = "멤버를 1명 이상 선택해야 합니다")
        private List<String> memberIds;
    }
}
