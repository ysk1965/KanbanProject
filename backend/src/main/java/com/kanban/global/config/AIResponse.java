package com.kanban.global.config;

public record AIResponse(String content, int inputTokens, int outputTokens, String model) {
}
