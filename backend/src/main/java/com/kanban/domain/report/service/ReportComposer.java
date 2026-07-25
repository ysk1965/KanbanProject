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
    private final ReportMemberDirectory memberDirectory;
    private final ObjectMapper objectMapper;

    /**
     * @param contentJson 저장·조회에 쓰는 <b>보강된</b> 본문 JSON. AI 원문이 아니라 지표·기능·스프린트까지
     *                    주입된 {@link ReportContent}를 직렬화한 것이라, 웹 페이지가 이 한 벌만 읽으면 된다.
     */
    public record Composed(ReportContent content, String contentJson, String mergedInput) {
    }

    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks) {
        return compose(boardId, reportType, language, period, chunks, List.of());
    }

    /**
     * @param dailyDigests 주간 작성 시 참고로 넣는 그 주 일일 보고서 요약들. 서술의 연속성·톤을 잇는
     *                     용도이며 지표·본문 근거는 아니다. 일일/수동 보고서는 빈 목록.
     */
    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks,
                            List<WeeklyRollupCollector.DailyDigest> dailyDigests) {
        String mergedInput = mergeInput(boardId, period, chunks, dailyDigests);
        String raw = reportAIService.generateAutoReportJson(reportType, mergedInput, language, boardId);

        ReportContent content = parse(raw);
        content.setMetrics(buildMetrics(chunks, reportType));
        content.setAttachments(harvestSlackAttachments(chunks));
        prependSourceFailures(content, chunks);

        // 기능별 진행·스프린트는 AI가 아니라 시스템이 집계해 주입한다(metrics와 동일). 실패해도 보고서는 진행.
        try {
            BoardProgressCollector.Progress progress =
                    progressCollector.compute(boardId, period, parseCommits(chunks), parseConfluenceDocs(chunks));
            content.setFeatures(progress.features());
            content.setSprint(progress.sprint());
            content.setCommitCategories(progress.commitCategories());
            // 담당자·키워드로 못 붙인 잔여 커밋은 AI가 의미 기반으로 기능에 배정(추정). 트랜잭션 밖에서 호출.
            classifyLeftoverCommits(content, progress, language, boardId);
            // 근거(태스크·체크리스트·커밋·문서)가 다 붙은 뒤, 기능별 요약을 AI가 한 번에 생성해 채운다.
            summarizeFeatures(content, language, boardId);
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
    private String mergeInput(String boardId, ReportPeriod period, List<SourceChunk> chunks,
                             List<WeeklyRollupCollector.DailyDigest> dailyDigests) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("period", period.label());

        // 소스를 가로질러 같은 사람을 잇는 명단. 없으면 넣지 않는다.
        List<Map<String, Object>> members = memberDirectory.roster(boardId);
        if (!members.isEmpty()) {
            root.put("members", members);
        }

        // 그 주 일일 보고서 요약 — 주간 서술이 흐름을 이어 쓰도록 참고로만 넣는다(근거는 소스 데이터).
        if (dailyDigests != null && !dailyDigests.isEmpty()) {
            root.put("daily_digests", dailyDigests);
        }

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
     * CONFLUENCE 소스의 changelogs에서 추가/수정/삭제 문서를 꺼내 기능 매핑용 목록으로 되살린다.
     * pages(주간보고 원문)는 제외한다 — 기능 단위 변경이 아니라 사람이 쓴 보고서 원문이라 매핑 대상이 아니다.
     * 미연결·수집 실패·파싱 실패면 빈 목록(매핑 생략).
     */
    private List<BoardProgressCollector.ConfluenceDocInfo> parseConfluenceDocs(List<SourceChunk> chunks) {
        for (SourceChunk chunk : chunks) {
            if (chunk.kind() != SourceKind.CONFLUENCE || !chunk.success() || !chunk.hasData()) {
                continue;
            }
            try {
                JsonNode changelogs = objectMapper.readTree(chunk.dataJson()).get("changelogs");
                if (changelogs == null || !changelogs.isArray()) {
                    return List.of();
                }
                List<BoardProgressCollector.ConfluenceDocInfo> docs = new ArrayList<>();
                for (JsonNode cl : changelogs) {
                    addConfluenceDocs(cl.get("added"), "added", docs);
                    addConfluenceDocs(cl.get("modified"), "modified", docs);
                    addConfluenceDocs(cl.get("deleted"), "deleted", docs);
                }
                return docs;
            } catch (Exception e) {
                log.warn("Confluence 문서 파싱 실패 — 기능별 문서 매핑 생략: {}", e.getMessage());
                return List.of();
            }
        }
        return List.of();
    }

    private void addConfluenceDocs(JsonNode arr, String changeType,
                                   List<BoardProgressCollector.ConfluenceDocInfo> into) {
        if (arr == null || !arr.isArray()) {
            return;
        }
        for (JsonNode d : arr) {
            String title = text(d, "title");
            if (title == null || title.isBlank()) {
                continue;
            }
            into.add(new BoardProgressCollector.ConfluenceDocInfo(
                    title, text(d, "url"), changeType, text(d, "author_id"), text(d, "updated_at")));
        }
    }

    /**
     * 기능별 요약을 AI가 한 번의 호출로 채운다. 각 기능의 근거(태스크·체크리스트·커밋·연관 문서)를 라벨로 만들어
     * 넘기면, AI가 "그 기간에 이 기능에서 실제로 무엇이 만들어졌는지"를 기능마다 몇 문장으로 돌려준다.
     * DB 트랜잭션 밖에서 호출한다. 실패하면 요약 없이(기존 description만으로) 진행한다.
     */
    private void summarizeFeatures(ReportContent content, String language, String boardId) {
        List<ReportContent.Feature> features = content.getFeatures();
        if (features == null || features.isEmpty()) {
            return;
        }
        // 그 기간에 실제로 변경/추가된 근거(커밋·연관 문서·완료 태스크)가 있는 기능만 요약한다.
        // 활동이 없던 기능은 summary=null로 남겨, 프론트가 "변경 있는 기능"을 앞에 구분해 정렬할 수 있게 한다.
        // 요약 대상이 줄어 AI 토큰도 아낀다.
        List<ReportContent.Feature> targets = features.stream()
                .filter(ReportComposer::hasEvidence)
                .toList();
        if (targets.isEmpty()) {
            return;
        }
        List<String> briefs = targets.stream().map(this::featureBrief).toList();
        List<String> summaries = reportAIService.summarizeFeatures(briefs, language, boardId);
        if (summaries.isEmpty()) {
            return; // AI 실패 — 요약 없이 진행
        }
        for (int i = 0; i < targets.size() && i < summaries.size(); i++) {
            String s = summaries.get(i);
            if (s != null && !s.isBlank()) {
                targets.get(i).setSummary(s.trim());
            }
        }
    }

    /**
     * 그 기간에 실제로 변경/추가된 근거가 있는 기능인지. 연결된 커밋·연관 문서·완료 태스크 중
     * 하나라도 있으면 true. 요약 생성 대상과 프론트 정렬(근거 있는 기능 우선)의 공통 기준이다.
     */
    private static boolean hasEvidence(ReportContent.Feature f) {
        return (f.getCommits() != null && !f.getCommits().isEmpty())
                || (f.getConfluenceDocs() != null && !f.getConfluenceDocs().isEmpty())
                || f.getTaskDone() > 0;
    }

    /** 기능 하나의 요약 근거를 한 덩어리 텍스트로. 태스크·체크리스트·커밋·연관 문서를 모두 담아 AI가 대조하게 한다. */
    private String featureBrief(ReportContent.Feature f) {
        StringBuilder sb = new StringBuilder();
        sb.append("NAME: ").append(f.getName());
        if (f.getDescription() != null && !f.getDescription().isBlank()) {
            sb.append("\nDESCRIPTION: ").append(f.getDescription());
        }
        sb.append("\nPROGRESS: ").append(f.getTaskDone()).append('/').append(f.getTaskTotal())
                .append(" tasks, status=").append(f.getStatus());
        if (f.getTasks() != null && !f.getTasks().isEmpty()) {
            sb.append("\nTASKS:");
            for (ReportContent.FeatureTask t : f.getTasks()) {
                sb.append("\n  - [").append(t.getStatus()).append("] ").append(t.getTitle());
                if (t.getChecklist() != null && !t.getChecklist().isEmpty()) {
                    for (ReportContent.ChecklistLine c : t.getChecklist()) {
                        sb.append("\n      ").append(c.isDone() ? "[x] " : "[ ] ").append(c.getTitle());
                    }
                }
            }
        }
        if (f.getCommits() != null && !f.getCommits().isEmpty()) {
            sb.append("\nCOMMITS:");
            for (ReportContent.FeatureCommit c : f.getCommits()) {
                sb.append("\n  - ").append(c.getSubject());
            }
        }
        if (f.getConfluenceDocs() != null && !f.getConfluenceDocs().isEmpty()) {
            sb.append("\nDOCS:");
            for (ReportContent.ConfluenceDoc d : f.getConfluenceDocs()) {
                sb.append("\n  - (").append(d.getChangeType()).append(") ").append(d.getTitle());
            }
        }
        return sb.toString();
    }

    /**
     * 슬랙 수집 결과에서 이미지/영상 첨부를 모은다. 상위 메시지와 스레드 답글 양쪽의 files를 훑고,
     * 같은 URL은 한 번만 담는다. 페이지의 "공유된 자료" 갤러리가 이걸 읽는다.
     */
    private List<ReportContent.Attachment> harvestSlackAttachments(List<SourceChunk> chunks) {
        for (SourceChunk chunk : chunks) {
            if (chunk.kind() != SourceKind.SLACK || !chunk.success() || !chunk.hasData()) {
                continue;
            }
            try {
                JsonNode messages = objectMapper.readTree(chunk.dataJson()).get("messages");
                if (messages == null || !messages.isArray()) {
                    return List.of();
                }
                List<ReportContent.Attachment> attachments = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                for (JsonNode message : messages) {
                    addFiles(message.get("files"), attachments, seen);
                    JsonNode replies = message.get("replies");
                    if (replies != null && replies.isArray()) {
                        for (JsonNode reply : replies) {
                            addFiles(reply.get("files"), attachments, seen);
                        }
                    }
                }
                return attachments;
            } catch (Exception e) {
                log.warn("슬랙 첨부 수집 실패 — 갤러리 생략: {}", e.getMessage());
                return List.of();
            }
        }
        return List.of();
    }

    private void addFiles(JsonNode files, List<ReportContent.Attachment> into, Set<String> seen) {
        if (files == null || !files.isArray()) {
            return;
        }
        for (JsonNode file : files) {
            String url = text(file, "url");
            if (url == null || !seen.add(url)) {
                continue;
            }
            into.add(ReportContent.Attachment.builder()
                    .title(text(file, "title"))
                    .type(text(file, "type"))
                    .url(url)
                    .build());
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

        // 지표 스트립은 4칸(커밋·변경 파일·슬랙 메시지·Confluence 변경)으로 고정 노출한다.
        List<ReportContent.Metric> metrics = new ArrayList<>();
        Map<String, Object> github = byKind.getOrDefault(SourceKind.GITHUB, Map.of());
        addMetric(metrics, "커밋", github.get("commits"), null);

        Object changedFiles = github.get("changed_files");
        boolean complete = Boolean.TRUE.equals(github.get("stats_complete"));
        addMetric(metrics, "변경 파일", changedFiles,
                complete ? null : "상위 " + github.get("stats_sampled_commits") + "건 집계");

        Map<String, Object> slack = byKind.getOrDefault(SourceKind.SLACK, Map.of());
        addMetric(metrics, "슬랙 메시지", slack.get("messages"), null);

        // Confluence 변경 수 = 추가·수정 문서 + 삭제 문서. 삭제가 있으면 서브에 표기.
        Map<String, Object> confluence = byKind.getOrDefault(SourceKind.CONFLUENCE, Map.of());
        int changedDocs = toInt(confluence.get("changed_docs"));
        int deletedDocs = toInt(confluence.get("deleted_docs"));
        int confluenceChanges = changedDocs + deletedDocs;
        if (confluenceChanges > 0) {
            addMetric(metrics, "Confluence 변경", confluenceChanges,
                    deletedDocs > 0 ? "삭제 " + deletedDocs : null);
        }
        return metrics;
    }

    /** 수집 지표는 Integer/Long/String 등으로 섞여 오므로 안전하게 int로 변환한다. 없거나 파싱 실패 시 0. */
    private int toInt(Object value) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value).trim());
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
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
