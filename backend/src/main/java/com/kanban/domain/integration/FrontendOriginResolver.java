package com.kanban.domain.integration;

import java.util.Map;
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

    private static final Map<String, String> FRONTEND_TO_API = Map.of(
            "https://bridgespots.com", "https://api.bridgespots.com",
            "https://www.bridgespots.com", "https://api.bridgespots.com",
            "https://milkyway.pe.kr", "https://api.milkyway.pe.kr",
            "https://www.milkyway.pe.kr", "https://api.milkyway.pe.kr",
            "http://localhost:5173", "http://localhost:8080",
            "http://localhost:5174", "http://localhost:8080",
            "http://localhost:3000", "http://localhost:8080"
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

    /**
     * Resolve API base URL from frontend origin.
     * Used for dynamic OAuth redirect URIs per domain.
     */
    public static String resolveApiBase(String origin, String fallback) {
        if (origin != null && FRONTEND_TO_API.containsKey(origin)) {
            return FRONTEND_TO_API.get(origin);
        }
        return fallback;
    }

    /**
     * Resolve OAuth redirect URI dynamically based on frontend origin.
     * Constructs: {apiBase}{callbackPath} (e.g., https://api.milkyway.pe.kr/api/v1/slack/oauth/callback)
     * Falls back to configuredRedirectUri if origin cannot be resolved.
     */
    public static String resolveOAuthRedirectUri(String origin, String callbackPath, String configuredRedirectUri) {
        String apiBase = resolveApiBase(origin, null);
        if (apiBase == null) {
            return configuredRedirectUri;
        }
        return apiBase + callbackPath;
    }
}
