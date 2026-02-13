package com.kanban.global.config;

public interface AIProvider {

    String chat(String systemPrompt, String userPrompt, String model, int maxTokens);

    default AIResponse chatWithUsage(String systemPrompt, String userPrompt, String model, int maxTokens) {
        String content = chat(systemPrompt, userPrompt, model, maxTokens);
        return new AIResponse(content, 0, 0, model);
    }
}
