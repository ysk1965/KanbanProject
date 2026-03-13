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

    // Reverse mapping: API host → Frontend URL
    private static final Map<String, String> API_TO_FRONTEND = Map.of(
            "api.bridgespots.com", "https://bridgespots.com",
            "api.milkyway.pe.kr", "https://milkyway.pe.kr",
            "localhost:8080", "http://localhost:5173",
            "localhost", "http://localhost:5173"
    );

    /**
     * Resolve frontend URL from Origin header, with API Host header as fallback.
     * 1) Origin present → use it directly
     * 2) Origin null → reverse-map from API Host (X-Forwarded-Host or Host)
     * 3) Both null → return fallback (FRONTEND_URL)
     */
    public static String resolveFrontendUrl(String origin, String apiHost, String fallback) {
        if (origin != null && !origin.isBlank()) {
            return origin.replaceAll("/+$", "");
        }
        if (apiHost != null && !apiHost.isBlank()) {
            String host = apiHost.split(",")[0].trim(); // X-Forwarded-Host can be comma-separated
            String frontendUrl = API_TO_FRONTEND.get(host);
            if (frontendUrl != null) {
                return frontendUrl;
            }
        }
        return fallback;
    }
}
