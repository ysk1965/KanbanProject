package com.kanban.domain.member.dto;

import com.kanban.domain.board.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class MemberRequest {

    @Getter
    @NoArgsConstructor
    public static class Invite {
        @NotBlank(message = "이메일은 필수입니다")
        @Email(message = "올바른 이메일 형식이 아닙니다")
        private String email;

        @NotNull(message = "역할은 필수입니다")
        private Role role;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateRole {
        @NotNull(message = "역할은 필수입니다")
        private Role role;
    }
}
