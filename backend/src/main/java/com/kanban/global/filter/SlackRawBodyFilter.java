package com.kanban.global.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Slack 폼(form-urlencoded) 엔드포인트의 <b>원본 바디 바이트</b>를 서명 검증용으로 보존한다.
 *
 * <p>Spring MVC는 폼 POST의 {@code @RequestBody String}을 원본 스트림이 아니라
 * {@code getParameterMap()}을 {@code URLEncoder}로 재조립한 문자열로 넘긴다.
 * Slack은 {@code *}를 {@code %2A}로 보내지만 {@code URLEncoder}는 {@code *}를 그대로 두므로,
 * 메시지 블록에 mrkdwn 볼드({@code *…*})가 하나라도 들어가면 HMAC이 어긋나 401이 난다.
 *
 * <p>이 필터는 Tomcat이 파라미터를 파싱하기 전에(Spring Security보다 앞서) 스트림을 읽어
 * {@link #ATTR_RAW_BODY}에 담고, 캐시된 바이트로 {@code getParameter*}와 {@code getInputStream()}을
 * 다시 제공하는 래퍼로 요청을 감싼다. 컨트롤러는 {@code @RequestAttribute(ATTR_RAW_BODY)}로 받는다.
 */
@Component
@Order(-200)
public class SlackRawBodyFilter extends OncePerRequestFilter {

    public static final String ATTR_RAW_BODY = "slack.rawBody";

    private static final Set<String> FORM_PATHS = Set.of(
            "/api/v1/slack/commands",
            "/api/v1/slack/interactions");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod()) || !FORM_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        byte[] raw = request.getInputStream().readAllBytes();
        request.setAttribute(ATTR_RAW_BODY, new String(raw, StandardCharsets.UTF_8));
        filterChain.doFilter(new CachedFormRequest(request, raw), response);
    }

    /**
     * 캐시된 바디로 파라미터를 직접 파싱해 돌려주는 래퍼.
     * 원본 스트림은 이미 소비됐으므로 컨테이너의 파라미터 파싱에 기대지 않는다.
     */
    static class CachedFormRequest extends HttpServletRequestWrapper {

        private final byte[] body;
        private final Map<String, String[]> params;

        CachedFormRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
            this.params = parseForm(new String(body, StandardCharsets.UTF_8), request.getQueryString());
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream in = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public boolean isFinished() { return in.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { }
                @Override public int read() { return in.read(); }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }

        @Override
        public String getParameter(String name) {
            String[] values = params.get(name);
            return values == null || values.length == 0 ? null : values[0];
        }

        @Override
        public String[] getParameterValues(String name) {
            String[] values = params.get(name);
            return values == null ? null : values.clone();
        }

        @Override
        public Map<String, String[]> getParameterMap() {
            return Collections.unmodifiableMap(params);
        }

        @Override
        public java.util.Enumeration<String> getParameterNames() {
            return Collections.enumeration(params.keySet());
        }

        private static Map<String, String[]> parseForm(String body, String queryString) {
            Map<String, List<String>> collected = new LinkedHashMap<>();
            for (String source : new String[] {queryString, body}) {
                if (source == null || source.isEmpty()) continue;
                for (String pair : source.split("&")) {
                    if (pair.isEmpty()) continue;
                    int eq = pair.indexOf('=');
                    String key = URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), StandardCharsets.UTF_8);
                    String value = eq < 0 ? "" : URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                    collected.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
                }
            }
            Map<String, String[]> result = new LinkedHashMap<>();
            collected.forEach((k, v) -> result.put(k, v.toArray(new String[0])));
            return result;
        }
    }
}
