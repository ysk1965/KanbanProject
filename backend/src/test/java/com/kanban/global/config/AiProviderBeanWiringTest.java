package com.kanban.global.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link ClaudeAIProvider} / {@link OpenAIProvider} 의 빈 등록 규칙을 고정한다.
 *
 * <p>배경: Claude를 반드시 써야 하는 기능이 {@code ClaudeAIProvider}를 직접 주입할 수 있어야 해서
 * 조건부 등록을 걷어냈다. 그 결과 {@code ai.provider=openai}에서 두 빈이 공존하게 되므로,
 * 범용 {@link AIProvider} 주입이 모호해지지 않도록 {@code OpenAIProvider}에 {@code @Primary}가
 * 필요하다. <b>이건 컴파일로 안 잡히고 부팅 시점에 터지는 종류의 실수라</b> 테스트로 못박는다.
 */
class AiProviderBeanWiringTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withBean("aiRestTemplate", RestTemplate.class, RestTemplate::new)
            .withBean(AiApiKeyResolver.class, () -> mock(AiApiKeyResolver.class))
            .withUserConfiguration(ClaudeAIProvider.class, OpenAIProvider.class);

    @Test
    @DisplayName("ai.provider=openai — 두 빈이 공존하고, 범용 AIProvider는 OpenAI로 해석된다")
    void openaiActive_bothBeansExist_primaryIsOpenAi() {
        contextRunner
                .withPropertyValues("ai.provider=openai")
                .run(context -> {
                    // 부팅 자체가 깨지지 않아야 한다 (NoUniqueBeanDefinitionException 방지)
                    assertThat(context).hasNotFailed();

                    // Claude는 ai.provider 값과 무관하게 항상 주입 가능해야 한다
                    assertThat(context).hasSingleBean(ClaudeAIProvider.class);
                    assertThat(context).hasSingleBean(OpenAIProvider.class);

                    // 기존 AI 기능 8곳의 라우팅은 그대로 OpenAI여야 한다
                    assertThat(context.getBean(AIProvider.class)).isInstanceOf(OpenAIProvider.class);
                });
    }

    @Test
    @DisplayName("ai.provider=claude — OpenAI 빈은 없고 Claude가 유일한 AIProvider다")
    void claudeActive_onlyClaudeBean() {
        contextRunner
                .withPropertyValues("ai.provider=claude")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(ClaudeAIProvider.class);
                    assertThat(context).doesNotHaveBean(OpenAIProvider.class);
                    assertThat(context.getBean(AIProvider.class)).isInstanceOf(ClaudeAIProvider.class);
                });
    }

    @Test
    @DisplayName("ai.provider 미설정 — Claude만 등록된다")
    void providerAbsent_onlyClaudeBean() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(ClaudeAIProvider.class);
            assertThat(context).doesNotHaveBean(OpenAIProvider.class);
            assertThat(context.getBean(AIProvider.class)).isInstanceOf(ClaudeAIProvider.class);
        });
    }
}
