package com.kanban.global.config;

public interface AIProvider {

    String chat(String systemPrompt, String userPrompt, String model, int maxTokens);

    default AIResponse chatWithUsage(String systemPrompt, String userPrompt, String model, int maxTokens) {
        String content = chat(systemPrompt, userPrompt, model, maxTokens);
        return new AIResponse(content, 0, 0, model);
    }

    /**
     * temperature를 지정해 호출한다. {@code null}이면 프로바이더 기본값(미지정)으로 둔다.
     *
     * <p>보고서처럼 <b>재현성</b>이 필요한 호출은 {@code 0.0}을 넘겨, 같은 입력을 재생성해도
     * 결과(헤드라인·리드·클러스터 소속 등)가 실행마다 흔들리지 않게 한다. 기본 구현은 temperature를
     * 무시하고 4-인자 버전에 위임한다(하위호환).
     */
    default AIResponse chatWithUsage(String systemPrompt, String userPrompt, String model, int maxTokens,
                                     Double temperature) {
        return chatWithUsage(systemPrompt, userPrompt, model, maxTokens);
    }
}
