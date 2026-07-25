package com.kanban.domain.member.dto;

import com.kanban.domain.board.BoardRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class MemberRequest {

    @Getter
    @NoArgsConstructor
    public static class Invite {
        @NotBlank(message = "이메일은 필수입니다")
        @Email(message = "올바른 이메일 형식이 아닙니다")
        private String email;

        @NotNull(message = "역할은 필수입니다")
        private BoardRole role;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateRole {
        @NotNull(message = "역할은 필수입니다")
        private BoardRole role;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateColor {
        @Pattern(regexp = "^(indigo|purple|teal|rose|amber|emerald|#[0-9A-Fa-f]{6})$",
                 message = "올바른 색상이 아닙니다")
        private String assigneeColor;
    }

    @Getter
    @NoArgsConstructor
    public static class ReorderMembers {
        @NotEmpty(message = "멤버 ID 목록은 필수입니다")
        private List<String> memberIds;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateJobRole {
        // null 허용 (직군 해제)
        private String jobRoleId;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateGithubLogin {
        // null/빈 문자열 허용 (연결 해제). GitHub 로그인: 영숫자와 하이픈, 최대 39자.
        @Pattern(regexp = "^$|^[A-Za-z0-9-]{1,39}$", message = "올바른 GitHub 아이디가 아닙니다")
        private String githubLogin;
    }

    @Getter
    @NoArgsConstructor
    public static class TransferOwnership {
        @NotBlank(message = "새 소유자의 사용자 ID는 필수입니다")
        private String newOwnerUserId;
    }
}
