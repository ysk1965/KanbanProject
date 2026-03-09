package com.kanban.domain.integration;

public class BrandResolver {

    public static String resolve(String url) {
        if (url != null && url.contains("milkyway")) {
            return "Milkyway";
        }
        return "BRIDGE SPOTS";
    }
}
