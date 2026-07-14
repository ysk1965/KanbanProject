package com.kanban.domain.auth.pat.dto;

import com.kanban.domain.auth.pat.PersonalAccessToken;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class PatDto {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @Size(max = 100, message = "이름은 100자 이내여야 합니다")
        private String name;

        /** null = 만료 없음. 지정 시 1~3650일. */
        @Min(value = 1, message = "만료일은 1일 이상이어야 합니다")
        @Max(value = 3650, message = "만료일은 3650일 이하여야 합니다")
        private Integer expiresInDays;
    }

    /** 목록/조회용. 원문 토큰은 포함하지 않는다. */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Response {
        private String id;
        private String name;
        private String tokenPrefix;
        private LocalDateTime lastUsedAt;
        private LocalDateTime expiresAt;
        private LocalDateTime createdAt;

        public static Response of(PersonalAccessToken pat) {
            return Response.builder()
                    .id(pat.getId())
                    .name(pat.getName())
                    .tokenPrefix(pat.getTokenPrefix())
                    .lastUsedAt(pat.getLastUsedAt())
                    .expiresAt(pat.getExpiresAt())
                    .createdAt(pat.getCreatedAt())
                    .build();
        }
    }

    /** 발급 직후 1회만 반환. {@code token} 은 이 응답에서만 볼 수 있다. */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Created {
        private String id;
        private String name;
        private String token;
        private String tokenPrefix;
        private LocalDateTime expiresAt;
        private LocalDateTime createdAt;

        public static Created of(PersonalAccessToken pat, String rawToken) {
            return Created.builder()
                    .id(pat.getId())
                    .name(pat.getName())
                    .token(rawToken)
                    .tokenPrefix(pat.getTokenPrefix())
                    .expiresAt(pat.getExpiresAt())
                    .createdAt(pat.getCreatedAt())
                    .build();
        }
    }
}
