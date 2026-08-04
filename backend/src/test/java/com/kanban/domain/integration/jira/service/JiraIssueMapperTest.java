package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * {@code fields.updated} 파싱 검증.
 *
 * <p>JIRA Cloud는 오프셋을 콜론 없이({@code +0900}) 보내는데 {@code OffsetDateTime.parse}는 이를 거부한다.
 * 그때 {@code updated}가 null이 되면 {@code JiraIssueLink.isStaleAgainst(null)}이 항상 false가 되어
 * 웹훅 단건 pull과 댓글 대조가 통째로 조용히 멈춘다 — 그래서 이 파싱은 회귀 테스트로 묶어둔다.
 */
class JiraIssueMapperTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final JiraIssueMapper sut = new JiraIssueMapper();

    private LocalDateTime parseUpdated(String raw) throws Exception {
        String json = """
            {"key":"QASA-1","id":"1","fields":{"summary":"s","updated":%s}}
            """.formatted(raw == null ? "null" : "\"" + raw + "\"");
        return sut.parse(mapper.readTree(json)).updated();
    }

    @Test
    void 콜론_없는_오프셋을_UTC로_파싱한다() throws Exception {
        // JIRA Cloud 실제 포맷 — 이게 null이 되면 증분 동기화 전체가 죽는다
        assertEquals(LocalDateTime.of(2026, 8, 4, 6, 37, 3, 449_000_000),
            parseUpdated("2026-08-04T15:37:03.449+0900"));
    }

    @Test
    void 콜론_있는_오프셋과_Z도_받는다() throws Exception {
        assertEquals(LocalDateTime.of(2026, 8, 4, 6, 37, 3, 449_000_000),
            parseUpdated("2026-08-04T15:37:03.449+09:00"));
        assertEquals(LocalDateTime.of(2026, 8, 4, 6, 37, 3),
            parseUpdated("2026-08-04T06:37:03Z"));
    }

    @Test
    void 오프셋이_없으면_UTC로_본다() throws Exception {
        assertEquals(LocalDateTime.of(2026, 8, 4, 6, 37, 3),
            parseUpdated("2026-08-04T06:37:03"));
    }

    @Test
    void 값이_없거나_깨졌으면_null() throws Exception {
        assertNull(parseUpdated(null));
        assertNull(parseUpdated(""));
        assertNull(parseUpdated("어제"));
    }
}
