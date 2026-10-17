package com.kanban.global.filter;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class SlackRawBodyFilterTest {

    private static final String PAYLOAD_JSON = "{\"type\":\"block_actions\",\"text\":\"*AI 추천 태스크* — ~x~ a+b\"}";
    // Slack(PHP urlencode) 방식: '*' → %2A, '~' → %7E, ' ' → '+'
    private static final String SLACK_BODY = "payload=%7B%22type%22%3A%22block_actions%22%2C%22text%22%3A%22"
            + "%2AAI+%EC%B6%94%EC%B2%9C+%ED%83%9C%EC%8A%A4%ED%81%AC%2A+%E2%80%94+%7Ex%7E+a%2Bb%22%7D";

    @Test
    void preservesRawBodyBytesAndParsesParameters() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/slack/interactions");
        request.setRequestURI("/api/v1/slack/interactions");
        request.setContentType("application/x-www-form-urlencoded");
        request.setContent(SLACK_BODY.getBytes(StandardCharsets.UTF_8));

        AtomicReference<HttpServletRequest> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain(new jakarta.servlet.http.HttpServlet() {
            @Override
            protected void service(jakarta.servlet.http.HttpServletRequest req,
                                   jakarta.servlet.http.HttpServletResponse res) {
                seen.set(req);
            }
        });

        new SlackRawBodyFilter().doFilter(request, new MockHttpServletResponse(), chain);

        HttpServletRequest wrapped = seen.get();
        assertThat(wrapped.getAttribute(SlackRawBodyFilter.ATTR_RAW_BODY)).isEqualTo(SLACK_BODY);
        assertThat(wrapped.getParameter("payload")).isEqualTo(PAYLOAD_JSON);
        assertThat(new String(wrapped.getInputStream().readAllBytes(), StandardCharsets.UTF_8)).isEqualTo(SLACK_BODY);
    }

    @Test
    void parsesSlashCommandFieldsInOrder() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/slack/commands");
        request.setRequestURI("/api/v1/slack/commands");
        request.setContentType("application/x-www-form-urlencoded");
        request.setContent("command=%2Fbridge&text=hello+%2Aworld%2A&user_id=U1&empty=".getBytes(StandardCharsets.UTF_8));

        AtomicReference<HttpServletRequest> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain(new jakarta.servlet.http.HttpServlet() {
            @Override
            protected void service(jakarta.servlet.http.HttpServletRequest req,
                                   jakarta.servlet.http.HttpServletResponse res) {
                seen.set(req);
            }
        });

        new SlackRawBodyFilter().doFilter(request, new MockHttpServletResponse(), chain);

        HttpServletRequest wrapped = seen.get();
        assertThat(wrapped.getParameter("command")).isEqualTo("/bridge");
        assertThat(wrapped.getParameter("text")).isEqualTo("hello *world*");
        assertThat(wrapped.getParameter("user_id")).isEqualTo("U1");
        assertThat(wrapped.getParameter("empty")).isEmpty();
        assertThat(wrapped.getParameter("missing")).isNull();
        assertThat(wrapped.getParameterMap().keySet()).containsExactly("command", "text", "user_id", "empty");
    }

    @Test
    void skipsNonSlackAndNonPostRequests() {
        SlackRawBodyFilter filter = new SlackRawBodyFilter();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/v1/slack/interactions"))).isTrue();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", "/api/v1/slack/events"))).isTrue();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("POST", "/api/v1/slack/commands"))).isFalse();
    }
}
