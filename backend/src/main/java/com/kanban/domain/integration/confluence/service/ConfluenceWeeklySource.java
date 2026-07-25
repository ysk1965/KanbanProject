package com.kanban.domain.integration.confluence.service;

import com.fasterxml.jackson.databind.JsonNode;
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

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 보드가 지정한 Confluence 대상에서 보고서용 원문을 가져온다.
 *
 * <p>두 갈래다:
 * <ul>
 *   <li><b>단일 문서(LABEL·PARENT_PAGE·TITLE_PATTERN)</b> — 기간에 갱신된 페이지의 현재 본문을
 *       그대로 넘긴다. 주간보고처럼 한 장을 인용하는 경우.</li>
 *   <li><b>부모 트리 변경(PARENT_TREE_CHANGELOG)</b> — 부모 하위 트리 전체에서 기간 내
 *       추가·수정·삭제된 문서만 골라 "변경 내역"으로 넘긴다. 스냅샷과 대조해 삭제까지 잡는다.</li>
 * </ul>
 *
 * <p>가져온 본문은 <b>요약하지 않고 원문 그대로</b> 넘긴다. 사람이 쓴 문장과 AI가 쓴 문장이
 * 섞이면 보고서를 신뢰할 수 없게 되므로, 인용 여부는 프롬프트가 판단하게 한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConfluenceWeeklySource implements ReportSource {

    private static final DateTimeFormatter CQL_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** 단일 문서 규칙에서 한 번에 넘길 페이지 수 상한 */
    private static final int MAX_PAGES = 5;
    /** 트리 변경 수집에서 상세 조회할 변경 문서 수 상한 */
    private static final int MAX_CHANGED_DOCS = 20;
    /** 트리 변경 수집 본문 전체 예산(문자) — 넘으면 자르고 truncated 표시 */
    private static final int CHANGELOG_BODY_BUDGET = 40_000;

    private final ConfluenceTargetResolver targetResolver;
    private final ConfluenceApiClient apiClient;
    private final ConfluenceStorageConverter converter;
    private final ConfluenceSnapshotService snapshotService;
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
    public boolean supportsWeeklyRollup() {
        return true;
    }

    /**
     * 일일 Confluence 수집분을 주간 한 벌로 합친다.
     * <ul>
     *   <li><b>단일 문서(pages)</b> — URL로 중복 제거해 잇는다. 한 페이지가 여러 날 갱신돼도 한 번만.</li>
     *   <li><b>트리 변경(changelogs)</b> — 같은 (space, parent_page_id)끼리 묶어 added/modified/deleted를
     *       합치고, 문서는 URL로 중복 제거한다. 같은 문서가 월·수 이틀 수정됐어도 한 건으로 센다.</li>
     * </ul>
     * 최신 조각이 먼저 오므로 그 순서를 살린다. 첫 수집 판정(삭제 기준선)은 일일 쪽에서 이미 끝났다.
     */
    @Override
    @SuppressWarnings("unchecked")
    public SourceChunk rollup(List<JsonNode> dailyData, ReportPeriod period) {
        String site = null;
        List<Map<String, Object>> pages = new ArrayList<>();
        Set<String> pageUrls = new HashSet<>();
        // (space|parent) -> 합쳐지는 changelog
        Map<String, Map<String, Object>> changelogByKey = new LinkedHashMap<>();

        for (JsonNode day : dailyData) {
            if (site == null && day.hasNonNull("site")) {
                site = day.get("site").asText();
            }
            JsonNode dayPages = day.get("pages");
            if (dayPages != null && dayPages.isArray()) {
                for (JsonNode page : dayPages) {
                    String url = page.hasNonNull("url") ? page.get("url").asText() : null;
                    if (url != null && !pageUrls.add(url)) {
                        continue;
                    }
                    pages.add(objectMapper.convertValue(page, Map.class));
                }
            }
            JsonNode dayLogs = day.get("changelogs");
            if (dayLogs != null && dayLogs.isArray()) {
                for (JsonNode log : dayLogs) {
                    mergeChangelog(changelogByKey, log, period);
                }
            }
        }

        List<Map<String, Object>> changelogs = new ArrayList<>(changelogByKey.values());
        changelogs.forEach(c -> c.remove("_seen")); // 중복 판정용 임시 키 — 저장 JSON엔 남기지 않는다
        int changeCount = changelogs.stream().mapToInt(ConfluenceWeeklySource::changeCount).sum();
        if (pages.isEmpty() && changeCount == 0) {
            return SourceChunk.empty(SourceKind.CONFLUENCE, "기간 내 Confluence 변경 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        if (!pages.isEmpty()) {
            metrics.put("pages", pages.size());
        }
        if (!changelogs.isEmpty()) {
            metrics.put("changed_docs", changelogs.stream()
                    .mapToInt(c -> listSize(c, "added") + listSize(c, "modified")).sum());
            metrics.put("deleted_docs", changelogs.stream().mapToInt(c -> listSize(c, "deleted")).sum());
        }

        return SourceChunk.ok(SourceKind.CONFLUENCE, toJson(site, pages, changelogs),
                metrics, buildSummary(pages, changelogs, List.of()));
    }

    /** 같은 (space, parent_page_id) changelog를 하나로 합친다. 문서는 URL로 중복 제거. */
    @SuppressWarnings("unchecked")
    private void mergeChangelog(Map<String, Map<String, Object>> byKey, JsonNode log, ReportPeriod period) {
        String space = log.hasNonNull("space") ? log.get("space").asText() : "";
        String parent = log.hasNonNull("parent_page_id") ? log.get("parent_page_id").asText() : "";
        Map<String, Object> target = byKey.computeIfAbsent(space + '|' + parent, k -> {
            Map<String, Object> fresh = new LinkedHashMap<>();
            fresh.put("space", space);
            fresh.put("parent_page_id", parent);
            fresh.put("period", period.label());
            fresh.put("added", new ArrayList<Map<String, Object>>());
            fresh.put("modified", new ArrayList<Map<String, Object>>());
            fresh.put("deleted", new ArrayList<Map<String, Object>>());
            fresh.put("_seen", new HashSet<String>());
            return fresh;
        });
        Set<String> seen = (Set<String>) target.get("_seen");
        if (Boolean.TRUE.equals(booleanNode(log, "truncated"))) {
            target.put("truncated", true);
        }
        for (String bucket : List.of("added", "modified", "deleted")) {
            JsonNode items = log.get(bucket);
            if (items == null || !items.isArray()) {
                continue;
            }
            List<Map<String, Object>> into = (List<Map<String, Object>>) target.get(bucket);
            for (JsonNode item : items) {
                String key = item.hasNonNull("url") ? item.get("url").asText()
                        : (item.hasNonNull("id") ? item.get("id").asText() : null);
                if (key != null && !seen.add(bucket + '|' + key)) {
                    continue;
                }
                into.add(objectMapper.convertValue(item, Map.class));
            }
        }
    }

    private Boolean booleanNode(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && v.asBoolean();
    }

    @Override
    public SourceChunk collect(String boardId, ReportPeriod period) {
        ConfluenceTargetResolver.CollectionPlan plan = targetResolver.resolve(boardId);
        if (plan.isEmpty()) {
            return SourceChunk.notConnected(SourceKind.CONFLUENCE);
        }

        List<Map<String, Object>> pages = new ArrayList<>();      // 단일 문서 규칙 결과
        List<Map<String, Object>> changelogs = new ArrayList<>(); // 트리 변경 규칙 결과
        List<String> failedSpaces = new ArrayList<>();

        for (ConfluenceTargetResolver.SpaceTarget target : plan.targets()) {
            ConfluenceMatchRule rule = target.matchRule() != null
                    ? target.matchRule() : ConfluenceMatchRule.LABEL;
            try {
                if (rule == ConfluenceMatchRule.PARENT_TREE_CHANGELOG) {
                    Map<String, Object> changelog = collectChangelog(boardId, plan, target, period);
                    if (changelog != null) {
                        changelogs.add(changelog);
                    }
                } else {
                    pages.addAll(collectOne(plan, target, period));
                }
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

        int changeCount = changelogs.stream().mapToInt(ConfluenceWeeklySource::changeCount).sum();
        if (pages.isEmpty() && changeCount == 0) {
            // 그 기간에 아무 변경이 없을 수 있다. 실패가 아니라 사실이다.
            return SourceChunk.empty(SourceKind.CONFLUENCE, "기간 내 Confluence 변경 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        if (!pages.isEmpty()) {
            metrics.put("pages", pages.size());
        }
        if (!changelogs.isEmpty()) {
            metrics.put("changed_docs", changelogs.stream()
                    .mapToInt(c -> listSize(c, "added") + listSize(c, "modified")).sum());
            metrics.put("deleted_docs", changelogs.stream().mapToInt(c -> listSize(c, "deleted")).sum());
        }

        return SourceChunk.ok(SourceKind.CONFLUENCE,
                toJson(plan.baseUrl(), pages, changelogs),
                metrics,
                buildSummary(pages, changelogs, failedSpaces));
    }

    // ── 부모 트리 변경 수집 ──────────────────────────────────

    /**
     * 부모 하위 트리에서 기간 내 추가·수정·삭제를 모은다. 변경이 하나도 없으면 null.
     */
    private Map<String, Object> collectChangelog(String boardId,
                                                 ConfluenceTargetResolver.CollectionPlan plan,
                                                 ConfluenceTargetResolver.SpaceTarget target,
                                                 ReportPeriod period) {
        String parentId = target.parentPageId();
        if (parentId == null || parentId.isBlank()) {
            return null;
        }

        // 1) 트리 전체 현재 집합 — 삭제 판정의 기준선이자 새 스냅샷.
        Map<String, String> currentIdToTitle = new LinkedHashMap<>();
        for (ConfluenceResponse.PageRef ref :
                apiClient.listDescendants(plan.cloudId(), plan.token(), parentId)) {
            currentIdToTitle.put(ref.getId(), ref.getTitle());
        }

        // 2) 삭제: 직전 스냅샷에 있었는데 지금 없는 문서. 기준선이 없으면(첫 수집) 건너뛴다.
        List<Map<String, Object>> deleted = new ArrayList<>();
        snapshotService.loadPrior(boardId, target.spaceKey(), parentId).ifPresent(prior ->
                prior.forEach((id, title) -> {
                    if (!currentIdToTitle.containsKey(id)) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("id", id);
                        item.put("title", title);
                        deleted.add(item);
                    }
                }));

        // 3) 기간 내 변경된 후손 검색 → 4) 상세로 추가/수정 분류
        Instant start = period.startInclusive().toInstant();
        Instant end = period.endExclusive().toInstant();
        List<Map<String, Object>> added = new ArrayList<>();
        List<Map<String, Object>> modified = new ArrayList<>();
        boolean truncated = false;
        int budget = 0;

        List<ConfluenceResponse.PageRef> changed =
                apiClient.searchPages(plan.cloudId(), plan.token(), buildChangelogCql(target, period));

        for (ConfluenceResponse.PageRef ref : changed) {
            if (!currentIdToTitle.containsKey(ref.getId())) {
                continue; // 검색이 트리 밖을 잡는 방어 (ancestor로 이미 걸러지지만)
            }
            if (added.size() + modified.size() >= MAX_CHANGED_DOCS || budget >= CHANGELOG_BODY_BUDGET) {
                truncated = true;
                break;
            }

            ConfluenceResponse.PageDetail detail =
                    apiClient.getPageDetail(plan.cloudId(), plan.token(), ref.getId());

            // 실제 편집 시각이 기간 밖이면 제외 — CQL 날짜가 일 단위라 경계에서 딸려오는 것을 막는다.
            Instant lastEdit = parseInstant(detail.getVersionCreatedAt());
            if (lastEdit == null) {
                lastEdit = parseInstant(ref.getLastUpdated());
            }
            if (lastEdit != null && (lastEdit.isBefore(start) || !lastEdit.isBefore(end))) {
                continue;
            }

            String text = converter.toPlainText(detail.getStorageBody());
            if (text.isBlank()) {
                continue;
            }
            budget += text.length();

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("title", detail.getTitle() != null ? detail.getTitle() : ref.getTitle());
            item.put("url", webUrl(plan.baseUrl(), detail.getWebUrl()));
            item.put("author_id", detail.getAuthorId());
            item.put("updated_at", detail.getVersionCreatedAt());
            item.put("body", text);

            Instant createdAt = parseInstant(detail.getCreatedAt());
            boolean isNew = createdAt != null && !createdAt.isBefore(start) && createdAt.isBefore(end);
            if (isNew) {
                added.add(item);
            } else {
                item.put("version", detail.getVersionNumber());
                modified.add(item);
            }
        }

        // 5) 이번 트리 집합을 기준선으로 저장.
        snapshotService.save(boardId, target.spaceKey(), parentId, currentIdToTitle);

        if (added.isEmpty() && modified.isEmpty() && deleted.isEmpty()) {
            return null;
        }

        Map<String, Object> changelog = new LinkedHashMap<>();
        changelog.put("space", target.spaceKey());
        changelog.put("parent_page_id", parentId);
        changelog.put("period", period.label());
        changelog.put("added", added);
        changelog.put("modified", modified);
        changelog.put("deleted", deleted);
        if (truncated) {
            changelog.put("truncated", true);
        }
        return changelog;
    }

    /** 트리 변경 검색 CQL: 부모 하위 <b>트리 전체</b>(ancestor)에서 기간에 갱신된 페이지. */
    private String buildChangelogCql(ConfluenceTargetResolver.SpaceTarget target, ReportPeriod period) {
        StringBuilder cql = new StringBuilder("type=page");
        cql.append(" and space=\"").append(escape(target.spaceKey())).append('"');
        cql.append(" and ancestor=").append(escape(target.parentPageId()));
        cql.append(" and lastModified >= \"")
           .append(period.startInclusive().format(CQL_DATE))
           .append("\" and lastModified <= \"")
           .append(period.endExclusive().format(CQL_DATE))
           .append('"');
        cql.append(" order by lastModified desc");
        return cql.toString();
    }

    // ── 단일 문서 수집(기존 동작) ────────────────────────────

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
            case PARENT_TREE_CHANGELOG -> {
                // 이 규칙은 collectChangelog로 흐르므로 여기 오지 않는다.
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

    // ── 공통 ────────────────────────────────────────────────

    private int changeCountForSummary(List<Map<String, Object>> changelogs, String key) {
        return changelogs.stream().mapToInt(c -> listSize(c, key)).sum();
    }

    private String buildSummary(List<Map<String, Object>> pages,
                                List<Map<String, Object>> changelogs,
                                List<String> failedSpaces) {
        List<String> parts = new ArrayList<>();
        if (!pages.isEmpty()) {
            parts.add("주간보고 " + pages.size() + "건");
        }
        if (!changelogs.isEmpty()) {
            int added = changeCountForSummary(changelogs, "added");
            int modified = changeCountForSummary(changelogs, "modified");
            int deleted = changeCountForSummary(changelogs, "deleted");
            parts.add("문서 변경 추가 " + added + " · 수정 " + modified + " · 삭제 " + deleted);
        }
        String summary = parts.isEmpty() ? "Confluence 변경 없음" : String.join(" / ", parts);
        if (!failedSpaces.isEmpty()) {
            summary += " (일부 스페이스 조회 실패: " + String.join(", ", failedSpaces) + ")";
        }
        return summary;
    }

    private static int changeCount(Map<String, Object> changelog) {
        return listSize(changelog, "added") + listSize(changelog, "modified")
                + listSize(changelog, "deleted");
    }

    @SuppressWarnings("unchecked")
    private static int listSize(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value instanceof List ? ((List<Object>) value).size() : 0;
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

    private String webUrl(String baseUrl, String webui) {
        if (webui == null || webui.isBlank()) {
            return null;
        }
        if (webui.startsWith("http")) {
            return webui;
        }
        return (baseUrl != null ? baseUrl : "") + "/wiki" + webui;
    }

    /** Confluence 시각 표기(Z 또는 오프셋)를 관대하게 파싱. 실패하면 null. */
    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (Exception ignored) {
            try {
                return OffsetDateTime.parse(value).toInstant();
            } catch (Exception e) {
                return null;
            }
        }
    }

    /** CQL 문자열 리터럴 안에서 따옴표가 구문을 깨지 않게 막는다. */
    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String toJson(String baseUrl, List<Map<String, Object>> pages,
                          List<Map<String, Object>> changelogs) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("site", baseUrl);
        if (!pages.isEmpty()) {
            root.put("page_count", pages.size());
            root.put("pages", pages);
        }
        if (!changelogs.isEmpty()) {
            root.put("changelogs", changelogs);
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("Confluence JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }
}
