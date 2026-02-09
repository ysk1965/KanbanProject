package com.kanban.global.config;

public interface AIProvider {

    String chat(String systemPrompt, String userPrompt, String model, int maxTokens);
}
