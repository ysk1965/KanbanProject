package com.kanban.global.security;

import com.kanban.domain.user.SystemRole;
import java.security.Principal;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

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

    /**
     * 인증 토큰에 실을 권한 — {@code ROLE_<systemRole>} (ROLE_USER / ROLE_TESTER / ROLE_ADMIN).
     * {@code hasRole('ADMIN')} 식 URL·메서드 시큐리티의 전제. systemRole 이 없으면 빈 목록.
     */
    public List<GrantedAuthority> getAuthorities() {
        if (systemRole == null) {
            return List.of();
        }
        return List.of(new SimpleGrantedAuthority("ROLE_" + systemRole.name()));
    }
}
