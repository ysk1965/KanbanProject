package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.ContractType;
import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.organization.WorkStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class OrgMemberRequest {

    @Getter
    @NoArgsConstructor
    public static class Invite {
        @NotBlank(message = "이메일은 필수입니다")
        @Email(message = "유효한 이메일 형식이어야 합니다")
        private String email;

        private OrgRole role;
        private String departmentId;
        private String jobTitle;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        private String departmentId;
        private String jobGroupId;
        private String jobTitle;
        private ContractType contractType;
        private WorkStatus workStatus;
        private String employeeId;
        private String phone;
        private LocalDate birthDate;
        private LocalDate hireDate;
        private String bio;
    }

    @Getter
    @NoArgsConstructor
    public static class ChangeRole {
        private OrgRole role;
    }
}
