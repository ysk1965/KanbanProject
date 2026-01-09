package com.kanban.global.security;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.security.Principal;

@Getter
@AllArgsConstructor
public class UserPrincipal implements Principal {

    private final String userId;
    private final String email;

    @Override
    public String getName() {
        return userId;
    }
}
