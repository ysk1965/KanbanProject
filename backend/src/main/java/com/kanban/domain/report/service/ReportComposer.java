package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 수집 결과를 하나로 합쳐 AI에 넣고, 돌아온 JSON을 {@link ReportContent}로 만든다.
 *
 * <p>지표(metrics)는 AI가 아니라 <b>수집 단계의 숫자를 그대로</b> 쓴다. 숫자를 모델에게 맡기면
 * 그럴듯하지만 틀린 값이 보고서에 박힌다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportComposer {

    private final ReportAIService reportAIService;
    private final BoardProgressCollector progressCollector;
    private final ObjectMapper objectMapper;

    /**
     * @param contentJson 저장·조회에 쓰는 <b>보강된</b> 본문 JSON. AI 원문이 아니라 지표·기능·스프린트까지
     *                    주입된 {@link ReportContent}를 직렬화한 것이라, 웹 페이지가 이 한 벌만 읽으면 된다.
     */
    public record Composed(ReportContent content, String contentJson, String mergedInput) {
    }

    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks) {
        String mergedInput = mergeInput(period, chunks);
        String raw = reportAIService.generateAutoReportJson(reportType, mergedInput, language, boardId);

        ReportContent content = parse(raw);
        content.setMetrics(buildMetrics(chunks, reportType));
        prependSourceFailures(content, chunks);

        // 기능별 진행·스프린트는 AI가 아니라 시스템이 집계해 주입한다(metrics와 동일). 실패해도 보고서는 진행.
        try {
            BoardProgressCollector.Progress progress =
                    progressCollector.compute(boardId, period, parseCommits(chunks));
            content.setFeatures(progress.features());
            content.setSprint(progress.sprint());
            content.setCommitCategories(progress.commitCategories());
            // 담당자·키워드로 못 붙인 잔여 커밋은 AI가 의미 기반으로 기능에 배정(추정). 트랜잭션 밖에서 호출.
            classifyLeftoverCommits(content, progress, language, boardId);
        } catch (Exception e) {
            log.warn("보드 진행 집계 실패 — 기능/스프린트 없이 진행 board={}: {}", boardId, e.getMessage());
        }

        return new Composed(content, serialize(content, raw), mergedInput);
    }

    /** 보강된 본문을 저장용 JSON으로. 실패 시 AI 원문으로 폴백해 보고서가 빈 채로 나가지 않게 한다. */
    private String serialize(ReportContent content, String fallbackRaw) {
        try {
            return objectMapper.writeValueAsString(content);
        } catch (Exception e) {
            log.warn("보고서 본문 직렬화 실패 — AI 원문으로 대체: {}", e.getMessage());
            return fallbackRaw;
        }
    }

    /**
     * 담당자·키워드로 기능에 못 붙인 잔여 커밋을 AI가 의미 기반으로 기능에 배정한다(추정).
     * DB 트랜잭션 밖에서 호출한다 — AI 네트워크 호출을 트랜잭션에 넣지 않기 위해서다.
     * 실패하거나 배정이 없으면 기존(담당자·키워드) 결과와 카테고리를 그대로 둔다.
     */
    private void classifyLeftoverCommits(ReportContent content, BoardProgressCollector.Progress progress,
                                         String language, String boardId) {
        List<BoardProgressCollector.CommitInfo> leftover = progress.leftover();
        List<ReportContent.Feature> features = progress.features();
        if (leftover == null || leftover.isEmpty() || features == null || features.isEmpty()) {
            return;
        }

        List<String> featureLabels = features.stream()
                .map(f -> f.getDescription() != null && !f.getDescription().isBlank()
                        ? f.getName() + " — " + f.getDescription()
                        : f.getName())
                .toList();
        List<String> commitLabels = leftover.stream()
                .map(c -> c.author() != null ? c.subject() + " [" + c.author() + "]" : c.subject())
                .toList();

        int[] assign = reportAIService.classifyCommits(featureLabels, commitLabels, language, boardId);
        if (assign.length == 0) {
            return; // AI 실패 — 기존 결과 유지
        }

        List<BoardProgressCollector.CommitInfo> stillLeft = new ArrayList<>();
        boolean anyAssigned = false;
        for (int i = 0; i < leftover.size(); i++) {
            int fi = i < assign.length ? assign[i] : -1;
            if (fi >= 0 && fi < features.size()) {
                ReportContent.Feature feat = features.get(fi);
                if (feat.getCommits() == null) {
                    feat.setCommits(new ArrayList<>());
                }
                if (feat.getCommits().size() < 40) {
                    feat.getCommits().add(progressCollector.toCommit(leftover.get(i), true));
                    anyAssigned = true;
                } else {
                    stillLeft.add(leftover.get(i));
                }
            } else {
                stillLeft.add(leftover.get(i));
            }
        }

        if (anyAssigned) {
            content.setCommitCategories(progressCollector.buildCategories(stillLeft));
        }
    }

    /** 소스별 원본을 한 덩어리로 묶는다. 실패한 소스도 사실로 남겨 AI가 언급할 수 있게 한다. */
    private String mergeInput(ReportPeriod period, List<SourceChunk> chunks) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("period", period.label());

        List<Map<String, Object>> failures = new ArrayList<>();
        for (SourceChunk chunk : chunks) {
            if (!chunk.success()) {
                failures.add(Map.of("source", chunk.kind().name(),
                        "error", chunk.errorMessage() != null ? chunk.errorMessage() : "unknown"));
                continue;
            }
            if (!chunk.hasData()) {
                continue;
            }
            root.put(chunk.kind().name().toLowerCase(Locale.ROOT), readTree(chunk.dataJson()));
        }
        if (!failures.isEmpty()) {
            root.put("collection_failures", failures);
        }

        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("보고서 입력 병합 실패: {}", e.getMessage());
            return "{}";
        }
    }

    private Object readTree(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return json;
        }
    }

    /**
     * GITHUB 소스의 commits_by_repo를 커밋 목록으로 되살린다. 기능별 커밋 매핑에 쓴다.
     * GitHub 미연결·수집 실패·파싱 실패면 빈 목록(매핑 생략).
     */
    private List<BoardProgressCollector.CommitInfo> parseCommits(List<SourceChunk> chunks) {
        for (SourceChunk chunk : chunks) {
            if (chunk.kind() != SourceKind.GITHUB || !chunk.success() || !chunk.hasData()) {
                continue;
            }
            try {
                JsonNode root = objectMapper.readTree(chunk.dataJson());
                JsonNode byRepo = root.get("commits_by_repo");
                if (byRepo == null || !byRepo.isObject()) {
                    return List.of();
                }
                List<BoardProgressCollector.CommitInfo> commits = new ArrayList<>();
                byRepo.fields().forEachRemaining(entry -> {
                    String repo = entry.getKey();
                    for (JsonNode item : entry.getValue()) {
                        commits.add(new BoardProgressCollector.CommitInfo(
                                repo,
                                text(item, "sha"),
                                text(item, "subject"),
                                text(item, "author"),
                                text(item, "at"),
                                text(item, "url"),
                                item.hasNonNull("changed_files") ? item.get("changed_files").asInt() : null));
                    }
                });
                return commits;
            } catch (Exception e) {
                log.warn("커밋 파싱 실패 — 기능별 커밋 매핑 생략: {}", e.getMessage());
                return List.of();
            }
        }
        return List.of();
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    /**
     * 모델이 코드펜스나 인사말을 붙여 보내는 일이 있으므로 첫 번째 JSON 객체만 잘라 읽는다.
     * 그래도 못 읽으면 원문을 리드 문단에 넣어 보고서가 빈 채로 나가지 않게 한다.
     */
    private ReportContent parse(String raw) {
        String candidate = extractJsonObject(raw);
        if (candidate != null) {
            try {
                ReportContent parsed = objectMapper.readValue(candidate, ReportContent.class);
                if (parsed.getHeadline() != null || parsed.getSections() != null) {
                    return normalize(parsed);
                }
            } catch (Exception e) {
                log.warn("보고서 JSON 파싱 실패 — 원문을 본문으로 사용합니다: {}", e.getMessage());
            }
        }
        return ReportContent.builder()
                .headline("보고서 요약")
                .lede(raw != null ? raw.trim() : "")
                .highlights(List.of())
                .sections(List.of())
                .risks(List.of())
                .build();
    }

    private ReportContent normalize(ReportContent content) {
        if (content.getHighlights() == null) content.setHighlights(List.of());
        if (content.getSections() == null) content.setSections(List.of());
        if (content.getRisks() == null) content.setRisks(new ArrayList<>());
        if (content.getHeadline() == null) content.setHeadline("보고서 요약");
        return content;
    }

    private String extractJsonObject(String raw) {
        if (raw == null) {
            return null;
        }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        return raw.substring(start, end + 1);
    }

    /** 지표 카드 — 수집 단계에서 계산된 값만 쓴다. */
    private List<ReportContent.Metric> buildMetrics(List<SourceChunk> chunks, ReportType reportType) {
        Map<SourceKind, Map<String, Object>> byKind = new EnumMap<>(SourceKind.class);
        for (SourceChunk chunk : chunks) {
            byKind.put(chunk.kind(), chunk.metrics());
        }

        List<ReportContent.Metric> metrics = new ArrayList<>();
        Map<String, Object> github = byKind.getOrDefault(SourceKind.GITHUB, Map.of());
        addMetric(metrics, "커밋", github.get("commits"), null);
        addMetric(metrics, "기여자", github.get("contributors"), null);

        Object changedFiles = github.get("changed_files");
        boolean complete = Boolean.TRUE.equals(github.get("stats_complete"));
        addMetric(metrics, "변경 파일", changedFiles,
                complete ? null : "상위 " + github.get("stats_sampled_commits") + "건 집계");

        Map<String, Object> kanban = byKind.getOrDefault(SourceKind.KANBAN, Map.of());
        addMetric(metrics, "완료 태스크", kanban.get("completed_tasks"), null);
        if (reportType == ReportType.WEEKLY_INTEGRATED) {
            addMetric(metrics, "지연", kanban.get("overdue_tasks"), null);
        }
        return metrics;
    }

    private void addMetric(List<ReportContent.Metric> metrics, String label, Object value, String delta) {
        if (value == null) {
            return;
        }
        metrics.add(ReportContent.Metric.builder()
                .label(label)
                .value(String.valueOf(value))
                .delta(delta)
                .build());
    }

    /**
     * 수집 실패는 AI 프롬프트에도 넣지만, 모델이 빠뜨릴 수 있으므로 여기서 한 번 더 못 박는다.
     * "조용히 빠진 소스"가 있는 보고서만큼 위험한 건 없다.
     */
    private void prependSourceFailures(ReportContent content, List<SourceChunk> chunks) {
        List<String> failures = chunks.stream()
                .filter(c -> !c.success())
                .map(c -> c.kind().name() + " 수집 실패 — 연결 확인 필요"
                        + (c.errorMessage() != null ? " (" + c.errorMessage() + ")" : ""))
                .toList();
        if (failures.isEmpty()) {
            return;
        }
        List<String> risks = new ArrayList<>(failures);
        content.getRisks().stream()
                .filter(r -> failures.stream().noneMatch(f -> f.startsWith(r) || r.startsWith(f)))
                .forEach(risks::add);
        content.setRisks(risks);
    }
}
