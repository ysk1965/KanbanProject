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
        return compose(boardId, reportType, language, period, chunks, List.of(), null);
    }

    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks,
                            List<WeeklyRollupCollector.DailyDigest> dailyDigests) {
        return compose(boardId, reportType, language, period, chunks, dailyDigests, null);
    }

    /**
     * @param dailyDigests  주간 작성 시 참고로 넣는 그 주 일일 보고서 요약들. 서술의 연속성·톤을 잇는
     *                      용도이며 지표·본문 근거는 아니다. 일일/수동 보고서는 빈 목록.
     * @param modelOverride 보드 설정에서 고른 리포트 AI 모델. null이면 서버 티어 기본을 쓴다.
     */
    public Composed compose(String boardId, ReportType reportType, String language,
                            ReportPeriod period, List<SourceChunk> chunks,
                            List<WeeklyRollupCollector.DailyDigest> dailyDigests,
                            String modelOverride) {
        String mergedInput = mergeInput(boardId, period, chunks, dailyDigests);

        // 본문 생성(AI#1: 헤드라인·리드·주요 변화)과 아래의 시스템 집계는 서로 독립이라 병렬로 돌린다.
        CompletableFuture<String> rawFuture = CompletableFuture.supplyAsync(
                () -> reportAIService.generateAutoReportJson(reportType, mergedInput, language, boardId, modelOverride));

        // 스프린트 게이지는 계속 시스템 집계로 채운다(비-AI). 기능 카드 축은 커밋 클러스터로 대체하지만
        // 스프린트 진행 자체는 그대로 유지한다.
        ProgressBundle progress = computeProgress(boardId, period, chunks, language);

        // 커밋-우선 개편의 두 축: 커밋을 결정론적으로 군집화(clusters)하고, 활동을 사람 기준으로 집계(members).
        // 둘 다 AI가 아니라 규칙으로 정한다 — 소속 결정을 AI에 맡기면 기존 미스매칭이 재발한다.
        List<BoardProgressCollector.CommitInfo> commits = parseCommits(chunks);
        List<ReportContent.Cluster> clusters = computeClusters(boardId, commits, chunks);
        // 규칙이 "기타"로 남긴 잔여 커밋만 AI가 재배치한다(합류 또는 잔여들끼리 새 군집). 확정 군집은 안 건드린다.
        // members가 커밋의 소속 클러스터 태그를 쓰므로 반드시 집계 전에 재배치를 끝낸다.
        clusters = placeResidueCommits(clusters, language, boardId, modelOverride);
        List<ReportContent.Member> members = computeMembers(boardId, period, commits, clusters, chunks);

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
        labelAndSynthesize(content, clusters, language, boardId, modelOverride);

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

    /** AI 잔여 배치에 넘길 잔여 커밋 상한 — 토큰을 묶는다. 초과분은 "기타"에 그대로 남긴다. */
    private static final int MAX_RESIDUE_COMMITS = 40;

    /**
     * AI 잔여 배치를 <b>호출할 최소 잔여 개수</b>. 이 미만이면 커밋 1~2건 배치하려 통째 AI 호출을 하는 게
     * 비용 대비 무의미하고, 작은 "기타" 군집은 그대로 두는 편이 낫다. 잔여가 이 값 이상일 때만 개입한다.
     */
    private static final int MIN_RESIDUE_COMMITS = 3;

    /**
     * 규칙이 "기타(misc)" 군집으로 남긴 잔여 커밋을 AI가 재배치한다: 확신 있게 기존 기능 군집에 합류시키거나,
     * 서로 묶어 새 군집으로 만든다. 확정 군집(scope/경로)과 인프라 군집은 입력에서 빼 <b>건드리지 않는다</b> —
     * 규칙이 이미 약하다고 판정한 잔여물에만 개입해 고아를 줄인다. AI가 옮긴 커밋은 {@code estimated=true}로,
     * 새 군집은 {@code signals}에 {@code ai} 신호로 근거를 남겨 사람이 검증할 수 있게 한다.
     *
     * <p>AI 호출이라 DB 트랜잭션 밖(compose)에서 부른다. 잔여 없음·AI 실패 시 입력을 그대로 돌려준다(현행 유지).
     */
    private List<ReportContent.Cluster> placeResidueCommits(List<ReportContent.Cluster> clusters,
                                                            String language, String boardId,
                                                            String modelOverride) {
        try {
            if (clusters == null || clusters.size() < 2) {
                return clusters;
            }
            ReportContent.Cluster misc = null;
            for (ReportContent.Cluster c : clusters) {
                if ("misc".equals(c.getKey())) {
                    misc = c;
                    break;
                }
            }
            if (misc == null || misc.getCommits() == null || misc.getCommits().size() < MIN_RESIDUE_COMMITS) {
                return clusters; // 잔여가 없거나 너무 적으면 AI 호출 없이 "기타"로 둔다
            }

            // 배치 대상 = 기존 기능 군집(인프라·기타 제외). 이 목록의 인덱스가 AI의 clusterIndex와 일치한다.
            List<ReportContent.Cluster> targets = new ArrayList<>();
            for (ReportContent.Cluster c : clusters) {
                if (!"infra".equals(c.getKind()) && !"misc".equals(c.getKey())) {
                    targets.add(c);
                }
            }

            List<ReportContent.FeatureCommit> all = misc.getCommits();
            List<ReportContent.FeatureCommit> orphans = all.size() > MAX_RESIDUE_COMMITS
                    ? new ArrayList<>(all.subList(0, MAX_RESIDUE_COMMITS)) : all;
            List<String> clusterLabels = targets.stream().map(this::clusterLabelLine).toList();
            List<String> orphanSubjects = orphans.stream()
                    .map(fc -> fc.getSubject() != null ? fc.getSubject() : "").toList();

            List<ReportAIService.ResiduePlacement> placements =
                    reportAIService.placeResidueCommits(clusterLabels, orphanSubjects, language, boardId, modelOverride);
            if (placements.isEmpty()) {
                return clusters; // 폴백: 잔여물을 기타로 그대로 둔다
            }

            Set<Integer> handled = new HashSet<>();
            Map<String, List<ReportContent.FeatureCommit>> newGroups = new LinkedHashMap<>();
            for (ReportAIService.ResiduePlacement p : placements) {
                int i = p.commitIndex();
                if (i < 0 || i >= orphans.size() || handled.contains(i)) {
                    continue;
                }
                ReportContent.FeatureCommit fc = orphans.get(i);
                if (p.clusterIndex() >= 0 && p.clusterIndex() < targets.size()) {
                    fc.setEstimated(true); // 규칙 매치가 아니라 AI 추정 배치임을 표시
                    targets.get(p.clusterIndex()).getCommits().add(fc);
                    handled.add(i);
                } else if (p.group() != null && !p.group().isBlank()) {
                    fc.setEstimated(true);
                    newGroups.computeIfAbsent(p.group().trim(), k -> new ArrayList<>()).add(fc);
                    handled.add(i);
                }
            }

            // 미처리 잔여 + 상한 초과분은 기타에 남긴다.
            List<ReportContent.FeatureCommit> leftover = new ArrayList<>();
            for (int i = 0; i < all.size(); i++) {
                if (i >= orphans.size() || !handled.contains(i)) {
                    leftover.add(all.get(i));
                }
            }

            // 재조립: 기능 군집(합류분 반영) → 새 AI 군집 → 남은 기타 → 인프라(맨 뒤).
            List<ReportContent.Cluster> result = new ArrayList<>(targets);
            int n = 0;
            for (Map.Entry<String, List<ReportContent.FeatureCommit>> e : newGroups.entrySet()) {
                result.add(newAiCluster("ai:" + (n++), e.getKey(), e.getValue()));
            }
            if (!leftover.isEmpty()) {
                misc.setCommits(leftover);
                result.add(misc);
            }
            for (ReportContent.Cluster c : clusters) {
                if ("infra".equals(c.getKind())) {
                    result.add(c);
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("잔여 커밋 AI 재배치 실패 — 기타 유지 board={}: {}", boardId, e.getMessage());
            return clusters;
        }
    }

    /** 잔여 배치 프롬프트에 넣을 기존 군집 한 줄 라벨: "제목 :: 대표 커밋 | 대표 커밋". */
    private String clusterLabelLine(ReportContent.Cluster c) {
        StringBuilder sb = new StringBuilder(c.getTitle() != null ? c.getTitle() : c.getKey());
        if (c.getCommits() != null && !c.getCommits().isEmpty()) {
            List<String> subs = new ArrayList<>();
            for (ReportContent.FeatureCommit fc : c.getCommits()) {
                if (fc.getSubject() != null) {
                    subs.add(fc.getSubject());
                }
                if (subs.size() >= 3) {
                    break;
                }
            }
            if (!subs.isEmpty()) {
                sb.append(" :: ").append(String.join(" | ", subs));
            }
        }
        return sb.toString();
    }

    /** AI가 잔여물을 묶어 만든 새 군집. 규칙 신호가 없으므로 ai 신호로 근거를 남기고 신뢰도는 MID. */
    private ReportContent.Cluster newAiCluster(String key, String label,
                                               List<ReportContent.FeatureCommit> commits) {
        return ReportContent.Cluster.builder()
                .key(key)
                .title(label)
                .summary(null)
                .confidence("MID")
                .kind(null)
                .signals(List.of(ReportContent.ClusterSignal.builder().kind("ai").value(label).build()))
                .commits(commits)
                .confluenceDocs(List.of())
                .tasks(List.of())
                .taskDone(0)
                .taskTotal(0)
                .build();
    }

    /** 구성원별 활동을 집계한다. 각 커밋에 소속 클러스터 태그를 달아 사람↔기능을 잇는다. 실패 시 빈 목록. */
    private List<ReportContent.Member> computeMembers(String boardId, ReportPeriod period,
                                                      List<BoardProgressCollector.CommitInfo> commits,
                                                      List<ReportContent.Cluster> clusters,
                                                      List<SourceChunk> chunks) {
        try {
            Map<String, MemberActivityCollector.ClusterTag> tagBySha = buildClusterTagBySha(clusters);
            return memberCollector.compute(boardId, period, commits, tagBySha, parseSlackMessages(chunks)).members();
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
                                    String language, String boardId, String modelOverride) {
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
        List<ReportAIService.ClusterLabel> labels = reportAIService.labelClusters(briefs, language, boardId, modelOverride);

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
            String overview = reportAIService.synthesizeOverview(digests, language, boardId, modelOverride);
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

}
