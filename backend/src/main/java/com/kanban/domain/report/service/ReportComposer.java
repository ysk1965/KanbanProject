package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.CompletableFuture;

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
    private final CommitClusterCollector clusterCollector;
    private final MemberActivityCollector memberCollector;
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

        // 본문 생성(AI#1: 헤드라인·리드·주요 변화)과 아래의 시스템 집계는 서로 독립이라 병렬로 돌린다.
        CompletableFuture<String> rawFuture = CompletableFuture.supplyAsync(
                () -> reportAIService.generateAutoReportJson(reportType, mergedInput, language, boardId));

        // 스프린트 게이지는 계속 시스템 집계로 채운다(비-AI). 기능 카드 축은 커밋 클러스터로 대체하지만
        // 스프린트 진행 자체는 그대로 유지한다.
        ProgressBundle progress = computeProgress(boardId, period, chunks, language);

        // 커밋-우선 개편의 두 축: 커밋을 결정론적으로 군집화(clusters)하고, 활동을 사람 기준으로 집계(members).
        // 둘 다 AI가 아니라 규칙으로 정한다 — 소속 결정을 AI에 맡기면 기존 미스매칭이 재발한다.
        List<BoardProgressCollector.CommitInfo> commits = parseCommits(chunks);
        List<ReportContent.Cluster> clusters = computeClusters(boardId, commits, chunks);
        List<ReportContent.Member> members = computeMembers(boardId, commits, clusters, chunks);

        String raw;
        try {
            raw = rawFuture.join();
        } catch (Exception e) {
            log.warn("본문 생성 AI 실패 — 빈 본문으로 진행 board={}: {}", boardId, e.getMessage());
            raw = null;
        }

        ReportContent content = parse(raw);
        content.setMetrics(buildMetrics(chunks, reportType));

        // 개발 내역(sections)·확인 필요(risks)는 커밋-우선 개편에서 제거한다 — 클러스터 요약이 서술을 대체하고
        // 리스크는 노이즈만 컸다. 리드·주요 변화(highlights)는 유지한다. 슬랙 미디어는 구성원 뷰로 흡수된다.
        content.setSections(List.of());
        content.setRisks(List.of());

        if (progress != null) {
            content.setSprint(progress.sprint());
        }
        content.setClusters(clusters);
        content.setMembers(members);

        // 클러스터별 제목·요약(AI 배치 1회)을 채우고, 그 요약을 종합해 상단 리드를 다시 쓴다.
        labelAndSynthesize(content, clusters, language, boardId);

        return new Composed(content, serialize(content, raw), mergedInput);
    }

    /** 커밋 클러스터를 결정론적으로 집계한다. 실패해도 보고서는 진행(빈 목록). */
    private List<ReportContent.Cluster> computeClusters(String boardId,
                                                        List<BoardProgressCollector.CommitInfo> commits,
                                                        List<SourceChunk> chunks) {
        try {
            return clusterCollector.compute(boardId, commits, parseConfluenceDocs(chunks)).clusters();
        } catch (Exception e) {
            log.warn("커밋 클러스터 집계 실패 board={}: {}", boardId, e.getMessage());
            return List.of();
        }
    }

    /** 구성원별 활동을 집계한다. 각 커밋에 소속 클러스터 태그를 달아 사람↔기능을 잇는다. 실패 시 빈 목록. */
    private List<ReportContent.Member> computeMembers(String boardId,
                                                      List<BoardProgressCollector.CommitInfo> commits,
                                                      List<ReportContent.Cluster> clusters,
                                                      List<SourceChunk> chunks) {
        try {
            Map<String, MemberActivityCollector.ClusterTag> tagBySha = buildClusterTagBySha(clusters);
            return memberCollector.compute(boardId, commits, tagBySha, parseSlackMessages(chunks)).members();
        } catch (Exception e) {
            log.warn("구성원 활동 집계 실패 board={}: {}", boardId, e.getMessage());
            return List.of();
        }
    }

    /** sha → 소속 클러스터 태그. 구성원 뷰가 커밋에 기능 태그를 다는 데 쓴다. 인프라 군집은 태그하지 않는다. */
    private Map<String, MemberActivityCollector.ClusterTag> buildClusterTagBySha(List<ReportContent.Cluster> clusters) {
        Map<String, MemberActivityCollector.ClusterTag> map = new HashMap<>();
        if (clusters == null) {
            return map;
        }
        for (ReportContent.Cluster c : clusters) {
            if ("infra".equals(c.getKind()) || c.getCommits() == null) {
                continue;
            }
            MemberActivityCollector.ClusterTag tag =
                    new MemberActivityCollector.ClusterTag(c.getKey(), c.getTitle());
            for (ReportContent.FeatureCommit fc : c.getCommits()) {
                if (fc.getSha() != null) {
                    map.put(fc.getSha(), tag);
                }
            }
        }
        return map;
    }

    /**
     * 클러스터별 제목·요약을 AI 배치 1회로 채우고(인프라 제외), 채워진 요약을 종합해 상단 리드를 다시 쓴다.
     * AI 실패 시 폴백 제목(scope/경로)과 첫 패스 리드를 그대로 둔다. DB 트랜잭션 밖에서 호출한다.
     */
    private void labelAndSynthesize(ReportContent content, List<ReportContent.Cluster> clusters,
                                    String language, String boardId) {
        if (clusters == null || clusters.isEmpty()) {
            return;
        }
        List<ReportContent.Cluster> targets = clusters.stream()
                .filter(c -> !"infra".equals(c.getKind()))
                .toList();
        if (targets.isEmpty()) {
            return;
        }
        List<String> briefs = targets.stream().map(this::clusterBrief).toList();
        List<ReportAIService.ClusterLabel> labels = reportAIService.labelClusters(briefs, language, boardId);

        List<String> digests = new ArrayList<>();
        for (int i = 0; i < targets.size(); i++) {
            ReportContent.Cluster c = targets.get(i);
            if (i < labels.size() && labels.get(i) != null) {
                ReportAIService.ClusterLabel label = labels.get(i);
                if (label.title() != null && !label.title().isBlank()) {
                    c.setTitle(label.title().trim());
                }
                if (label.summary() != null && !label.summary().isBlank()) {
                    c.setSummary(label.summary().trim());
                }
            }
            if (c.getSummary() != null && !c.getSummary().isBlank()) {
                digests.add("FEATURE: " + c.getTitle() + "\nSUMMARY: " + c.getSummary());
            }
        }

        if (!digests.isEmpty()) {
            String overview = reportAIService.synthesizeOverview(digests, language, boardId);
            if (overview != null && !overview.isBlank()) {
                content.setLede(overview.trim());
            }
        }
    }

    /** 클러스터 하나의 라벨링 근거를 한 덩어리 텍스트로. 대표 커밋·부착 태스크·문서를 담아 AI가 대조하게 한다. */
    private String clusterBrief(ReportContent.Cluster c) {
        StringBuilder sb = new StringBuilder();
        if (c.getSignals() != null && !c.getSignals().isEmpty()) {
            List<String> sig = new ArrayList<>();
            for (ReportContent.ClusterSignal s : c.getSignals()) {
                sig.add(s.getKind() + "=" + s.getValue());
            }
            sb.append("SIGNALS: ").append(String.join(", ", sig));
        }
        if (c.getCommits() != null && !c.getCommits().isEmpty()) {
            sb.append("\nCOMMITS:");
            for (ReportContent.FeatureCommit fc : c.getCommits()) {
                sb.append("\n  - ").append(fc.getSubject());
            }
        }
        if (c.getTasks() != null && !c.getTasks().isEmpty()) {
            sb.append("\nTASKS:");
            for (ReportContent.FeatureTask t : c.getTasks()) {
                sb.append("\n  - ").append(t.getTitle());
            }
        }
        if (c.getConfluenceDocs() != null && !c.getConfluenceDocs().isEmpty()) {
            sb.append("\nDOCS:");
            for (ReportContent.ConfluenceDoc d : c.getConfluenceDocs()) {
                sb.append("\n  - ").append(d.getTitle());
            }
        }
        return sb.toString();
    }

    /** compose의 병렬 구간이 본문에 주입할 기능 집계 결과 묶음. content를 건드리지 않고 값만 넘긴다. */
    private record ProgressBundle(List<ReportContent.Feature> features,
                                  ReportContent.Sprint sprint,
                                  List<ReportContent.CommitCategory> categories) {
    }

    /**
     * 기능/스프린트 집계(비-AI)와 잔여 커밋 AI 분류(AI#2)를 함께 수행한다. AI#1과 병렬로 돌기 위해 분리했고,
     * content가 아니라 결과 묶음만 돌려 병렬 구간끼리 공유 상태를 없앴다. 실패 시 null(기능/스프린트 없이 진행).
     */
    private ProgressBundle computeProgress(String boardId, ReportPeriod period,
                                           List<SourceChunk> chunks, String language) {
        try {
            // 커밋-우선 개편 후 이 집계는 스프린트 게이지만 쓴다. 기능 카드 축은 커밋 클러스터가 대체하므로
            // 잔여 커밋 AI 배정(AI#2)은 호출하지 않는다 — 추정 매칭을 폐기한 것이 개편의 핵심이다.
            BoardProgressCollector.Progress progress =
                    progressCollector.compute(boardId, period, parseCommits(chunks), parseConfluenceDocs(chunks));
            return new ProgressBundle(progress.features(), progress.sprint(), progress.commitCategories());
        } catch (Exception e) {
            log.warn("보드 진행 집계 실패 — 스프린트 없이 진행 board={}: {}", boardId, e.getMessage());
            return null;
        }
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
     * 담당자로 기능에 못 붙인 잔여 커밋을 AI가 의미 기반으로 기능에 배정한다(추정). content가 아니라
     * progress를 받아 병렬 구간 안에서 안전하게 돌고, 본문에 넣을 <b>최종 커밋 카테고리</b>를 돌려준다.
     * DB 트랜잭션 밖에서 호출한다 — AI 네트워크 호출을 트랜잭션에 넣지 않기 위해서다.
     *
     * <p>파일 경로·본문(내역) 신호가 하나도 없는 커밋은 AI에 넣지 않는다 — 근거 없이 찍게 하면 토큰만 쓰고
     * 오분류를 부른다. 그런 커밋과 AI가 못 붙인 커밋, 잡무(chore) 커밋은 그대로 카테고리에 남는다.
     *
     * @return 본문에 세팅할 커밋 카테고리. 배정이 없거나 AI 실패면 집계 단계의 기본 카테고리를 그대로 돌려준다.
     */
    private List<ReportContent.CommitCategory> classifyLeftoverCommits(
            BoardProgressCollector.Progress progress, String language, String boardId) {
        List<BoardProgressCollector.CommitInfo> leftover = progress.leftover();
        List<ReportContent.Feature> features = progress.features();
        if (leftover == null || leftover.isEmpty() || features == null || features.isEmpty()) {
            return progress.commitCategories();
        }

        // 파일·본문 신호가 있는 커밋만 AI 분류 대상. 신호 없는 커밋은 잔여로 남긴다(카테고리로만 표시).
        List<BoardProgressCollector.CommitInfo> classifiable = leftover.stream()
                .filter(this::hasClassifySignal)
                .toList();
        List<BoardProgressCollector.CommitInfo> stillLeft = new ArrayList<>(leftover.stream()
                .filter(c -> !hasClassifySignal(c))
                .toList());
        if (classifiable.isEmpty()) {
            return progress.commitCategories(); // 넣을 신호 있는 커밋이 없음 — AI 호출 생략
        }

        List<String> featureLabels = features.stream()
                .map(this::buildFeatureLabel)
                .toList();
        List<String> commitLabels = classifiable.stream()
                .map(this::buildCommitLabel)
                .toList();

        int[] assign = reportAIService.classifyCommits(featureLabels, commitLabels, language, boardId);
        if (assign.length == 0) {
            return progress.commitCategories(); // AI 실패 — 기존 결과 유지
        }

        boolean anyAssigned = false;
        for (int i = 0; i < classifiable.size(); i++) {
            int fi = i < assign.length ? assign[i] : -1;
            if (fi >= 0 && fi < features.size()) {
                ReportContent.Feature feat = features.get(fi);
                if (feat.getCommits() == null) {
                    feat.setCommits(new ArrayList<>());
                }
                if (feat.getCommits().size() < 40) {
                    feat.getCommits().add(progressCollector.toCommit(classifiable.get(i), true));
                    anyAssigned = true;
                } else {
                    stillLeft.add(classifiable.get(i));
                }
            } else {
                stillLeft.add(classifiable.get(i));
            }
        }

        if (!anyAssigned) {
            return progress.commitCategories();
        }
        // 기능에 새로 붙은 커밋을 뺀 나머지(신호 없는 잔여 + AI 미배정 + 잡무)로 카테고리를 다시 만든다.
        stillLeft.addAll(progress.choreCommits());
        return progressCollector.buildCategories(stillLeft);
    }

    /** AI 커밋 분류에 넣을 만한 신호가 있는지 — 변경 파일 경로나 커밋 본문(내역) 중 하나라도 있으면 참. */
    private boolean hasClassifySignal(BoardProgressCollector.CommitInfo c) {
        return !c.filesOrEmpty().isEmpty() || !c.bodyOrEmpty().isBlank();
    }

    /** AI 커밋 분류에 넣을 기능당 태스크 라벨 상한. 커밋과 겹칠 어휘 근거만 있으면 되므로 앞쪽 몇 개면 충분. */
    private static final int MAX_TASKS_IN_LABEL = 8;

    /**
     * AI 커밋 분류용 기능 라벨. 기능명 + 설명에 더해 <b>태스크 제목</b>까지 붙인다 —
     * 실제 작업 단위가 태스크라, 커밋 메시지/파일경로가 태스크 이름과 겹치는 경우가 많다.
     */
    private String buildFeatureLabel(ReportContent.Feature f) {
        StringBuilder sb = new StringBuilder(f.getName() != null ? f.getName() : "");
        if (f.getDescription() != null && !f.getDescription().isBlank()) {
            sb.append(" — ").append(f.getDescription());
        }
        if (f.getTasks() != null && !f.getTasks().isEmpty()) {
            List<String> taskTitles = new ArrayList<>();
            for (ReportContent.FeatureTask t : f.getTasks()) {
                if (t.getTitle() != null && !t.getTitle().isBlank()) {
                    taskTitles.add(t.getTitle());
                }
                if (taskTitles.size() >= MAX_TASKS_IN_LABEL) {
                    break;
                }
            }
            if (!taskTitles.isEmpty()) {
                sb.append(" | tasks: ").append(String.join(", ", taskTitles));
            }
        }
        return sb.toString();
    }

    /**
     * AI 커밋 분류용 커밋 라벨. 커밋 제목 + <b>본문(내역)</b> + author에 더해 <b>변경 파일 경로</b>를 붙인다.
     * 커밋 내역("무엇을/왜")과 파일 경로("어디를")가 어느 기능을 진전시켰는지 보여주는 가장 강한 두 신호다
     * (예: 본문에 "빅마우스 밸런스 재조정" + 경로 assets/bigmouse/** → "빅마우스" 기능).
     */
    private String buildCommitLabel(BoardProgressCollector.CommitInfo c) {
        StringBuilder sb = new StringBuilder(c.subject() != null ? c.subject() : "");
        if (!c.bodyOrEmpty().isBlank()) {
            sb.append(" — ").append(c.bodyOrEmpty());
        }
        if (c.author() != null) {
            sb.append(" [").append(c.author()).append("]");
        }
        if (!c.filesOrEmpty().isEmpty()) {
            sb.append(" | files: ").append(String.join(", ", c.filesOrEmpty()));
        }
        return sb.toString();
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
            Object tree = readTree(chunk.dataJson());
            // 커밋 body는 잔여 커밋 분류(AI#2)용 신호일 뿐이라, 본문 생성(AI#1) 입력에선 뺀다(토큰 절약).
            // parseCommits는 원본 chunk.dataJson()을 따로 읽으므로 여기서 지워도 분류에는 body가 그대로 간다.
            if (chunk.kind() == SourceKind.GITHUB) {
                stripCommitBodies(tree);
            }
            root.put(chunk.kind().name().toLowerCase(Locale.ROOT), tree);
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

    /** 병합된 GITHUB 입력 트리에서 커밋 body를 제거한다(AI#1은 body 없이, AI#2 분류만 body 사용). */
    private void stripCommitBodies(Object githubTree) {
        if (!(githubTree instanceof JsonNode node)) {
            return;
        }
        JsonNode byRepo = node.get("commits_by_repo");
        if (byRepo == null || !byRepo.isObject()) {
            return;
        }
        byRepo.forEach(commits -> {
            if (commits.isArray()) {
                commits.forEach(item -> {
                    if (item instanceof ObjectNode obj) {
                        obj.remove("body");
                    }
                });
            }
        });
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
                                text(item, "body"),
                                text(item, "author"),
                                text(item, "at"),
                                text(item, "url"),
                                item.hasNonNull("changed_files") ? item.get("changed_files").asInt() : null,
                                parseFiles(item.get("files"))));
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

    /** 커밋 item의 files 배열(문자열 경로)을 목록으로. 없거나 배열이 아니면 빈 목록. */
    private List<String> parseFiles(JsonNode filesNode) {
        if (filesNode == null || !filesNode.isArray()) {
            return List.of();
        }
        List<String> files = new ArrayList<>();
        for (JsonNode f : filesNode) {
            if (f != null && !f.isNull()) {
                files.add(f.asText());
            }
        }
        return files;
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

    /**
     * SLACK 소스의 messages 배열을 그대로 꺼낸다. 구성원별 활동 집계가 user·text·files를 사람 기준으로 묶는다.
     * 미연결·수집 실패·파싱 실패면 null(구성원 슬랙 집계 생략).
     */
    private JsonNode parseSlackMessages(List<SourceChunk> chunks) {
        for (SourceChunk chunk : chunks) {
            if (chunk.kind() != SourceKind.SLACK || !chunk.success() || !chunk.hasData()) {
                continue;
            }
            try {
                JsonNode messages = objectMapper.readTree(chunk.dataJson()).get("messages");
                return messages != null && messages.isArray() ? messages : null;
            } catch (Exception e) {
                log.warn("슬랙 메시지 파싱 실패 — 구성원 슬랙 집계 생략: {}", e.getMessage());
                return null;
            }
        }
        return null;
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
        List<String> digests = new ArrayList<>();
        for (int i = 0; i < targets.size() && i < summaries.size(); i++) {
            String s = summaries.get(i);
            if (s != null && !s.isBlank()) {
                ReportContent.Feature f = targets.get(i);
                f.setSummary(s.trim());
                digests.add(featureDigest(f));
            }
        }
        // 근거 있는 기능별 요약이 모이면, 그걸 종합해 상단 리드를 더 풍부하게 다시 쓴다.
        rewriteLedeFromFeatures(content, digests, language, boardId);
    }

    /**
     * 기능별 요약을 종합해 보고서 상단 리드를 다시 쓴다. 첫 패스 리드는 원본 소스만 보고 짧게 쓰지만,
     * 근거가 다 붙은 기능별 요약을 종합하면 "각 기능에서 무엇이 진전됐는지"를 폭넓게 담은 리드가 된다.
     * DB 트랜잭션 밖에서 호출한다. 종합할 요약이 없거나 AI 실패 시 기존 리드를 그대로 둔다.
     */
    private void rewriteLedeFromFeatures(ReportContent content, List<String> digests,
                                         String language, String boardId) {
        if (digests.isEmpty()) {
            return;
        }
        String overview = reportAIService.synthesizeOverview(digests, language, boardId);
        if (overview != null && !overview.isBlank()) {
            content.setLede(overview.trim());
        }
    }

    /**
     * 리드 종합용 기능 라벨: 기능명 · 진행 · 요약. 요약이 이미 태스크·커밋·문서 근거를 담고 있어
     * 원문 태스크까지는 붙이지 않는다(중복·토큰 절약).
     */
    private String featureDigest(ReportContent.Feature f) {
        return "FEATURE: " + f.getName()
                + " (" + f.getTaskDone() + '/' + f.getTaskTotal() + " tasks, " + f.getStatus() + ')'
                + "\nSUMMARY: " + f.getSummary();
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
            String link = text(file, "link");
            // 영상은 포스터(url)가 없을 수 있어 link까지 중복 기준으로 본다. 둘 다 없으면 담을 게 없다.
            String dedupKey = url != null ? url : link;
            if (dedupKey == null || !seen.add(dedupKey)) {
                continue;
            }
            into.add(ReportContent.Attachment.builder()
                    .title(text(file, "title"))
                    .type(text(file, "type"))
                    .url(url)
                    .link(link)
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
