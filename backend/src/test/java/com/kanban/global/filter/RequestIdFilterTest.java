package com.kanban.global.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@DisplayName("RequestIdFilter — 상관 ID 전파")
class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    private String runAndCaptureMdc(MockHttpServletRequest request, MockHttpServletResponse response) throws Exception {
        AtomicReference<String> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain(new jakarta.servlet.http.HttpServlet() {
            @Override
            protected void service(
                    jakarta.servlet.http.HttpServletRequest req, jakarta.servlet.http.HttpServletResponse res) {
                seen.set(MDC.get(RequestIdFilter.MDC_KEY));
            }
        });
        filter.doFilter(request, response, chain);
        return seen.get();
    }

    @Test
    @DisplayName("헤더가 없으면 ID 를 생성해 MDC 와 응답 헤더에 싣는다")
    void generatesIdWhenAbsent() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/boards");
        MockHttpServletResponse response = new MockHttpServletResponse();

        String inChain = runAndCaptureMdc(request, response);

        assertThat(inChain).isNotBlank().hasSize(16);
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo(inChain);
    }

    @Test
    @DisplayName("클라이언트가 보낸 X-Request-Id 를 그대로 쓴다")
    void echoesProvidedId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/boards");
        request.addHeader(RequestIdFilter.HEADER, "alb-trace_1.2-abc");
        MockHttpServletResponse response = new MockHttpServletResponse();

        String inChain = runAndCaptureMdc(request, response);

        assertThat(inChain).isEqualTo("alb-trace_1.2-abc");
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("alb-trace_1.2-abc");
    }

    @Test
    @DisplayName("허용 문자 밖이거나 너무 긴 값은 버리고 새로 만든다 (로그 인젝션 방지)")
    void rejectsUnsafeIds() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/x");
        request.addHeader(RequestIdFilter.HEADER, "bad id\nwith newline");
        MockHttpServletResponse response = new MockHttpServletResponse();

        String inChain = runAndCaptureMdc(request, response);

        assertThat(inChain).isNotEqualTo("bad id\nwith newline").hasSize(16);
        assertThat(RequestIdFilter.sanitize("a".repeat(65))).isNull();
        assertThat(RequestIdFilter.sanitize("   ")).isNull();
        assertThat(RequestIdFilter.sanitize("ok-ID_1.0")).isEqualTo("ok-ID_1.0");
    }

    @Test
    @DisplayName("요청이 끝나면 MDC 를 비운다 (스레드 풀 재사용 시 오염 방지)")
    void clearsMdcAfterRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/x");
        runAndCaptureMdc(request, new MockHttpServletResponse());

        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
        assertThat(RequestIdFilter.current()).isNull();
    }

    @Test
    @DisplayName("체인 안에서 예외가 나도 MDC 는 지워진다")
    void clearsMdcOnException() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/x");
        MockFilterChain chain = new MockFilterChain(new jakarta.servlet.http.HttpServlet() {
            @Override
            protected void service(
                    jakarta.servlet.http.HttpServletRequest req, jakarta.servlet.http.HttpServletResponse res) {
                throw new IllegalStateException("boom");
            }
        });

        try {
            filter.doFilter(request, new MockHttpServletResponse(), chain);
        } catch (Exception expected) {
            // 전파는 그대로, 정리만 확인한다
        }

        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
    }
}
