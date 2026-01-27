package com.kanban.global.security;

import com.kanban.domain.user.SystemRole;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.security.Principal;

@Getter
@AllArgsConstructor
public class UserPrincipal implements Principal {

    private final String userId;
    private final String email;
    private final SystemRole systemRole;

    @Override
    public String getName() {
        return userId;
    }

    public boolean isAdmin() {
        return this.systemRole == SystemRole.ADMIN;
    }
}
