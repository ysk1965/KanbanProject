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
    private final ObjectMapper objectMapper;

    public record Composed(ReportContent content, String rawJson, String mergedInput) {
    }

    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks) {
        String mergedInput = mergeInput(period, chunks);
        String raw = reportAIService.generateAutoReportJson(reportType, mergedInput, language, boardId);

        ReportContent content = parse(raw);
        content.setMetrics(buildMetrics(chunks, reportType));
        prependSourceFailures(content, chunks);

        return new Composed(content, raw, mergedInput);
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
