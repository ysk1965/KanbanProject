package com.kanban.domain.integration;

import java.util.Set;

public class FrontendOriginResolver {

    private static final Set<String> ALLOWED_ORIGINS = Set.of(
            "https://bridgespots.com",
            "https://www.bridgespots.com",
            "https://milkyway.pe.kr",
            "https://www.milkyway.pe.kr",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000"
    );

    /**
     * Validate origin against allowed domains.
     * Returns the origin if valid, otherwise returns the fallback URL.
     */
    public static String resolve(String origin, String fallback) {
        if (origin != null && ALLOWED_ORIGINS.contains(origin)) {
            return origin;
        }
        return fallback;
    }
}
