package com.kanban.domain.integration.confluence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.confluence.ConfluenceMatchRule;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 그 주에 작성된 주간보고 페이지를 찾아 본문을 가져온다.
 *
 * <p>가져온 본문은 <b>요약하지 않고 원문 그대로</b> 넘긴다. 사람이 쓴 문장과 AI가 쓴 문장이
 * 섞이면 보고서를 신뢰할 수 없게 되므로, 인용 여부는 프롬프트가 판단하게 한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConfluenceWeeklySource implements ReportSource {

    private static final DateTimeFormatter CQL_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** 한 번에 넘길 페이지 수 상한 */
    private static final int MAX_PAGES = 5;

    private final ConfluenceTargetResolver targetResolver;
    private final ConfluenceApiClient apiClient;
    private final ConfluenceStorageConverter converter;
    private final ObjectMapper objectMapper;

    @Override
    public SourceKind kind() {
        return SourceKind.CONFLUENCE;
    }

    @Override
    public boolean isConfigured(String boardId) {
        return !targetResolver.resolve(boardId).isEmpty();
    }

    @Override
    public SourceChunk collect(String boardId, ReportPeriod period) {
        ConfluenceTargetResolver.CollectionPlan plan = targetResolver.resolve(boardId);
        if (plan.isEmpty()) {
            return SourceChunk.notConnected(SourceKind.CONFLUENCE);
        }

        List<Map<String, Object>> collected = new ArrayList<>();
        List<String> failedSpaces = new ArrayList<>();

        for (ConfluenceTargetResolver.SpaceTarget target : plan.targets()) {
            try {
                collected.addAll(collectOne(plan, target, period));
            } catch (Exception e) {
                log.warn("Confluence 수집 실패 board={} space={}: {}",
                        boardId, target.spaceKey(), e.getMessage());
                failedSpaces.add(target.spaceKey());
            }
        }

        if (!failedSpaces.isEmpty() && failedSpaces.size() == plan.targets().size()) {
            return SourceChunk.failed(SourceKind.CONFLUENCE,
                    "스페이스 " + failedSpaces.size() + "곳 모두 조회 실패 — 연결 확인 필요");
        }
        if (collected.isEmpty()) {
            // 그 주에 아무도 주간보고를 안 썼을 수 있다. 실패가 아니라 사실이다.
            return SourceChunk.empty(SourceKind.CONFLUENCE, "기간 내 작성된 주간보고 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("pages", collected.size());

        String summary = "주간보고 " + collected.size() + "건"
                + (failedSpaces.isEmpty() ? "" : " (일부 스페이스 조회 실패: " + String.join(", ", failedSpaces) + ")");

        return SourceChunk.ok(SourceKind.CONFLUENCE, toJson(collected, plan.baseUrl()), metrics, summary);
    }

    private List<Map<String, Object>> collectOne(ConfluenceTargetResolver.CollectionPlan plan,
                                                 ConfluenceTargetResolver.SpaceTarget target,
                                                 ReportPeriod period) {
        String cql = buildCql(target, period);
        List<ConfluenceResponse.PageRef> pages =
                apiClient.searchPages(plan.cloudId(), plan.token(), cql);

        List<Map<String, Object>> results = new ArrayList<>();
        for (ConfluenceResponse.PageRef page : pages) {
            if (results.size() >= MAX_PAGES) {
                break;
            }
            String storage = apiClient.getPageStorageBody(plan.cloudId(), plan.token(), page.getId());
            String text = converter.toPlainText(storage);
            if (text.isBlank()) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", page.getTitle());
            item.put("space", target.spaceKey());
            item.put("url", pageUrl(plan.baseUrl(), page));
            item.put("last_updated", page.getLastUpdated());
            item.put("body", text);
            results.add(item);
        }
        return results;
    }

    /**
     * 식별 규칙별 CQL. 기간은 {@code lastModified} 기준으로 잡는다 —
     * 주간보고는 주중에 만들어 두고 마지막에 채우는 경우가 많아 created로 잡으면 놓친다.
     */
    private String buildCql(ConfluenceTargetResolver.SpaceTarget target, ReportPeriod period) {
        StringBuilder cql = new StringBuilder("type=page");
        cql.append(" and space=\"").append(escape(target.spaceKey())).append('"');

        ConfluenceMatchRule rule = target.matchRule() != null
                ? target.matchRule() : ConfluenceMatchRule.LABEL;
        switch (rule) {
            case LABEL -> {
                if (target.label() != null && !target.label().isBlank()) {
                    cql.append(" and label=\"").append(escape(target.label())).append('"');
                }
            }
            case PARENT_PAGE -> {
                if (target.parentPageId() != null && !target.parentPageId().isBlank()) {
                    cql.append(" and parent=").append(escape(target.parentPageId()));
                }
            }
            case TITLE_PATTERN -> {
                if (target.titlePattern() != null && !target.titlePattern().isBlank()) {
                    cql.append(" and title~\"").append(escape(target.titlePattern())).append('"');
                }
            }
        }

        cql.append(" and lastModified >= \"")
           .append(period.startInclusive().format(CQL_DATE))
           .append("\" and lastModified <= \"")
           .append(period.endExclusive().format(CQL_DATE))
           .append('"');
        cql.append(" order by lastModified desc");
        return cql.toString();
    }

    private String pageUrl(String baseUrl, ConfluenceResponse.PageRef page) {
        if (page.getUrl() == null) {
            return null;
        }
        if (page.getUrl().startsWith("http")) {
            return page.getUrl();
        }
        return (baseUrl != null ? baseUrl : "") + "/wiki" + page.getUrl();
    }

    /** CQL 문자열 리터럴 안에서 따옴표가 구문을 깨지 않게 막는다. */
    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String toJson(List<Map<String, Object>> pages, String baseUrl) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("site", baseUrl);
        root.put("page_count", pages.size());
        root.put("pages", pages);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("Confluence JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }
}
