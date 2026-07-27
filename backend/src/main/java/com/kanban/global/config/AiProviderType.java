package com.kanban.global.config;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

/**
 * 관리자 대시보드에서 키를 관리할 수 있는 AI 프로바이더.
 *
 * <p>{@code ai.provider} 설정으로 지금 어느 쪽이 활성인지가 정해지지만, 키 관리는 활성 여부와
 * 무관하게 양쪽 모두 가능해야 한다(프로바이더를 전환하기 전에 키를 미리 넣어둘 수 있어야 하므로).
 */
@Getter
@RequiredArgsConstructor
public enum AiProviderType {

    CLAUDE("claude", "Claude (Anthropic)", "ai.claude.api_key", "sk-ant-"),
    OPENAI("openai", "OpenAI", "ai.openai.api_key", "sk-");

    /** API 경로/응답에 쓰는 소문자 식별자. */
    private final String code;

    /** 화면 표시용 이름. */
    private final String displayName;

    /** {@code system_config.config_key} 값. */
    private final String configKey;

    /** 키 형식 사전 검증용 접두사. */
    private final String keyPrefix;

    /** 마지막 유효성 확인 시각을 저장하는 config_key. */
    public String verifiedAtConfigKey() {
        return configKey + ".verified_at";
    }

    public static AiProviderType fromCode(String code) {
        return Arrays.stream(values())
                .filter(type -> type.code.equalsIgnoreCase(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown AI provider: " + code));
    }
}
