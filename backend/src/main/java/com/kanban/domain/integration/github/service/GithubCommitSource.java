package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.domain.integration.github.dto.GithubCommit;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 보드에 연결된 저장소들의 기간 내 커밋을 모은다.
 *
 * <p>수집 실패를 예외로 던지지 않는다. 저장소 하나가 404를 내도 나머지는 모으고,
 * 실패한 저장소는 요약에 남긴다.
 *
 * <p>DB 조회는 {@link GithubTargetResolver}가 트랜잭션 안에서 먼저 끝내고,
 * 여기서는 값만 받아 HTTP를 친다 — 커넥션을 붙든 채 수십 번 네트워크를 타지 않기 위해서다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GithubCommitSource implements ReportSource {

    /** 이 표시가 들어간 커밋은 보고서에서 뺀다 */
    private static final String SKIP_MARKER = "[skip-report]";
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    private final GithubTargetResolver targetResolver;
    private final GithubApiClient apiClient;
    private final GithubAppProperties properties;
    private final ObjectMapper objectMapper;

    @Override
    public SourceKind kind() {
        return SourceKind.GITHUB;
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
     * 일일 커밋 수집분을 주간 한 벌로 합친다. 저장소별 커밋을 이어붙이되 <b>sha로 중복을 제거</b>한다 —
     * 일일 구간이 겹치거나 재생성으로 같은 커밋이 두 조각에 들어와도 한 번만 센다.
     * 입력 조각은 최신 날짜가 먼저 오므로, 그 순서를 그대로 살려 최신 커밋이 위로 온다.
     */
    @Override
    @SuppressWarnings("unchecked")
    public SourceChunk rollup(List<JsonNode> dailyData, ReportPeriod period) {
        // repo -> 커밋 항목들. sha(+repo)로 중복 제거.
        Map<String, List<Map<String, Object>>> byRepo = new LinkedHashMap<>();
        Set<String> seen = new HashSet<>();
        List<String> failedRepos = new ArrayList<>();
        Set<String> failedSeen = new HashSet<>();

        for (JsonNode day : dailyData) {
            JsonNode failed = day.get("failed_repos");
            if (failed != null && failed.isArray()) {
                failed.forEach(r -> {
                    if (failedSeen.add(r.asText())) {
                        failedRepos.add(r.asText());
                    }
                });
            }
            JsonNode repos = day.get("commits_by_repo");
            if (repos == null || !repos.isObject()) {
                continue;
            }
            repos.fields().forEachRemaining(entry -> {
                String repo = entry.getKey();
                for (JsonNode item : entry.getValue()) {
                    String sha = item.hasNonNull("sha") ? item.get("sha").asText() : null;
                    // sha가 없으면(방어) 중복 판정 불가 — 그대로 둔다.
                    if (sha != null && !seen.add(repo + '@' + sha)) {
                        continue;
                    }
                    byRepo.computeIfAbsent(repo, k -> new ArrayList<>())
                            .add(objectMapper.convertValue(item, Map.class));
                }
            });
        }

        int total = byRepo.values().stream().mapToInt(List::size).sum();
        if (total == 0) {
            return SourceChunk.empty(SourceKind.GITHUB, "기간 내 커밋 없음");
        }

        Map<String, Object> metrics = rollupMetrics(byRepo);
        String summary = "커밋 " + total + "건 · 기여자 " + metrics.get("contributors") + "명"
                + (failedRepos.isEmpty() ? "" : " (일부 저장소 조회 실패: " + String.join(", ", failedRepos) + ")");
        return SourceChunk.ok(SourceKind.GITHUB, rollupJson(byRepo, period, failedRepos, total),
                metrics, summary);
    }

    /**
     * 병합된 커밋에서 지표를 다시 센다. 변경 파일 수는 일일 수집 때 상위 N건만 채워진 값이라
     * 조각을 합쳐도 전체가 아니다 — 표본으로 표시한다(additions/deletions는 스냅샷에 없어 뺀다).
     */
    private Map<String, Object> rollupMetrics(Map<String, List<Map<String, Object>>> byRepo) {
        Map<String, Long> byAuthor = new LinkedHashMap<>();
        int total = 0;
        int changedFiles = 0;
        int sampled = 0;
        for (List<Map<String, Object>> commits : byRepo.values()) {
            for (Map<String, Object> c : commits) {
                total++;
                Object author = c.get("author");
                if (author != null) {
                    byAuthor.merge(String.valueOf(author), 1L, Long::sum);
                }
                Object cf = c.get("changed_files");
                if (cf instanceof Number n) {
                    changedFiles += n.intValue();
                    sampled++;
                }
            }
        }
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("commits", total);
        metrics.put("contributors", byAuthor.size());
        metrics.put("repos", byRepo.size());
        metrics.put("changed_files", changedFiles);
        metrics.put("stats_sampled_commits", sampled);
        metrics.put("stats_complete", sampled == total);
        metrics.put("by_author", byAuthor);
        return metrics;
    }

    private String rollupJson(Map<String, List<Map<String, Object>>> byRepo, ReportPeriod period,
                              List<String> failedRepos, int total) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("period", period.label());
        root.put("total_commits", total);
        if (!failedRepos.isEmpty()) {
            root.put("failed_repos", failedRepos);
        }
        root.put("commits_by_repo", byRepo);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("커밋 롤업 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public SourceChunk collect(String boardId, ReportPeriod period) {
        GithubTargetResolver.CollectionPlan plan = targetResolver.resolve(boardId);
        if (plan.isEmpty()) {
            return SourceChunk.notConnected(SourceKind.GITHUB);
        }

        List<GithubCommit> collected = new ArrayList<>();
        List<String> failedRepos = new ArrayList<>();

        // GitHub의 until은 경계를 포함하므로 1초를 빼서 다음 구간과 겹치지 않게 한다.
        String sinceIso = period.startIso();
        String untilIso = period.endExclusive().minusSeconds(1).toInstant().toString();

        for (GithubTargetResolver.RepoTarget target : plan.targets()) {
            try {
                List<GithubCommit> commits = apiClient.listCommits(
                        plan.installationId(), target.repoFullName(),
                        target.branch(), sinceIso, untilIso);
                collected.addAll(filter(commits, target.excludedAuthors()));
            } catch (Exception e) {
                log.warn("커밋 수집 실패 board={} repo={}: {}",
                        boardId, target.repoFullName(), e.getMessage());
                failedRepos.add(target.repoFullName());
            }
        }

        // 저장소를 전부 못 읽었으면 실패로 본다 — 일부만 실패했으면 나머지로 진행한다.
        if (!failedRepos.isEmpty() && failedRepos.size() == plan.targets().size()) {
            return SourceChunk.failed(SourceKind.GITHUB,
                    "저장소 " + failedRepos.size() + "곳 모두 조회 실패 — 연결 확인 필요");
        }
        if (collected.isEmpty()) {
            return SourceChunk.empty(SourceKind.GITHUB, "기간 내 커밋 없음");
        }

        collected.sort(Comparator.comparing(GithubCommit::committedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        enrichStats(plan.installationId(), collected);

        Map<String, Object> metrics = buildMetrics(collected);
        String summary = "커밋 " + collected.size() + "건 · 기여자 " + metrics.get("contributors") + "명"
                + (failedRepos.isEmpty() ? "" : " (일부 저장소 조회 실패: " + String.join(", ", failedRepos) + ")");

        return SourceChunk.ok(SourceKind.GITHUB, toJson(collected, period, failedRepos), metrics, summary);
    }

    /** 머지 커밋·제외 작성자·skip 표시를 걸러낸다. */
    private List<GithubCommit> filter(List<GithubCommit> commits, Set<String> excluded) {
        return commits.stream()
                .filter(c -> !c.merge())
                .filter(c -> !c.subject().contains(SKIP_MARKER))
                .filter(c -> {
                    String author = c.displayAuthor();
                    return author == null || !excluded.contains(author.toLowerCase(Locale.ROOT));
                })
                .toList();
    }

    /**
     * 변경 파일 수는 커밋당 API 1회를 더 써야 해서 상한까지만 채운다.
     * 상한을 넘으면 그 아래 커밋들의 파일 수가 0으로 남으므로, 지표에 집계 범위를 함께 실어 보낸다.
     */
    private void enrichStats(String installationId, List<GithubCommit> commits) {
        int limit = Math.min(properties.getCommitDetailLimit(), commits.size());
        for (int i = 0; i < limit; i++) {
            commits.set(i, apiClient.enrichWithStats(installationId, commits.get(i)));
        }
    }

    private Map<String, Object> buildMetrics(List<GithubCommit> commits) {
        Map<String, Long> byAuthor = commits.stream()
                .map(GithubCommit::displayAuthor)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(a -> a, LinkedHashMap::new, Collectors.counting()));

        int detailed = Math.min(properties.getCommitDetailLimit(), commits.size());

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("commits", commits.size());
        metrics.put("contributors", byAuthor.size());
        metrics.put("repos", commits.stream().map(GithubCommit::repoFullName).distinct().count());
        metrics.put("changed_files", commits.stream().mapToInt(GithubCommit::changedFiles).sum());
        metrics.put("additions", commits.stream().mapToInt(GithubCommit::additions).sum());
        metrics.put("deletions", commits.stream().mapToInt(GithubCommit::deletions).sum());
        // 파일 수·라인 수는 상위 N건만 집계된 값이다. 전체인 척하지 않게 범위를 밝힌다.
        metrics.put("stats_sampled_commits", detailed);
        metrics.put("stats_complete", detailed == commits.size());
        metrics.put("by_author", byAuthor);
        return metrics;
    }

    /** AI 입력과 보고서 페이지가 함께 쓰는 원본. 커밋 메시지는 첫 줄만 넣는다. */
    private String toJson(List<GithubCommit> commits, ReportPeriod period, List<String> failedRepos) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("period", period.label());
        root.put("total_commits", commits.size());
        if (!failedRepos.isEmpty()) {
            root.put("failed_repos", failedRepos);
        }

        Map<String, List<Map<String, Object>>> byRepo = new LinkedHashMap<>();
        for (GithubCommit c : commits) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("sha", c.shortSha());
            item.put("subject", c.subject());
            String body = c.bodyText();
            if (!body.isBlank()) {
                item.put("body", body);
            }
            item.put("author", c.displayAuthor());
            item.put("at", c.committedAt() != null ? c.committedAt().format(TIME) : null);
            if (c.changedFiles() > 0) {
                item.put("changed_files", c.changedFiles());
            }
            if (!c.filesOrEmpty().isEmpty()) {
                item.put("files", c.filesOrEmpty());
            }
            item.put("url", c.htmlUrl());
            byRepo.computeIfAbsent(c.repoFullName(), k -> new ArrayList<>()).add(item);
        }
        root.put("commits_by_repo", byRepo);

        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("커밋 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }
}
