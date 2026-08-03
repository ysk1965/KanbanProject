package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 평문 → ADF 변환 검증. JIRA는 빈 문자열 {@code text} 노드를 거부(400)하므로,
 * 빈 줄이 섞인 댓글에서 조용히 전송 실패가 나지 않아야 한다.
 */
class JiraAdfConverterTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 빈_줄에는_text_노드를_만들지_않는다() {
        JsonNode inline = JiraAdfConverter.toAdf(mapper, "첫 줄\n\n셋째 줄")
            .path("content").get(0).path("content");

        assertEquals("doc", JiraAdfConverter.toAdf(mapper, "x").path("type").asText());
        // 첫 줄 / hardBreak / hardBreak(빈 줄) / 셋째 줄 — 빈 문자열 text 노드가 끼면 JIRA가 400을 낸다
        assertEquals(4, inline.size());
        assertEquals("첫 줄", inline.get(0).path("text").asText());
        assertEquals("hardBreak", inline.get(1).path("type").asText());
        assertEquals("hardBreak", inline.get(2).path("type").asText());
        assertEquals("셋째 줄", inline.get(3).path("text").asText());
    }

    @Test
    void 빈_본문도_유효한_문서를_만든다() {
        JsonNode doc = JiraAdfConverter.toAdf(mapper, "");

        assertEquals(1, doc.path("content").size());
        assertEquals("paragraph", doc.path("content").get(0).path("type").asText());
        assertFalse(doc.path("content").get(0).has("content"));
    }

    @Test
    void 왕복_변환에서_본문이_보존된다() {
        String original = "💬 BRIDGE · 유상건\n리뷰 부탁드립니다\n\n재현 스텝 첨부";
        assertEquals(original, JiraAdfConverter.toPlainText(JiraAdfConverter.toAdf(mapper, original)));
    }
}
