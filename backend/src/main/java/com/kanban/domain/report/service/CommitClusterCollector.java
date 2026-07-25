package com.kanban.domain.report.service;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.report.service.BoardProgressCollector.ConfluenceDocInfo;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 커밋을 <b>기능 단위로 결정론적으로 군집화</b>한다 — 커밋-우선 개편의 심장.
 *
 * <p>기존 {@link BoardProgressCollector}는 기능 카드를 축으로 두고 커밋을 담당자 로그인으로 끼워 맞춘
 * 뒤 안 맞으면 AI가 "추정" 배정했다. 이 방식은 태스크 0/0 카드에 커밋이 억지로 붙는 미스매칭을 낳았다.
 *
 * <p>여기서는 축을 뒤집는다. 커밋을 먼저 읽어 <b>scope → 파일경로 → 키워드</b> 우선순위의 신호로 묶고,
 * 태스크·Confluence 문서는 키워드가 겹칠 때만 <b>부가 근거</b>로 붙인다. 어느 군집에 넣을지는 규칙이 정하고,
 * 사람이 읽을 제목·요약만 뒤에서 AI가 채운다({@link ReportAIService#labelClusters}). 소속 결정을 AI에 맡기지
 * 않는 게 핵심이다 — 맡기면 기존 미스매칭이 재발한다.
 *
 * <p>이 집계는 best-effort다. 예외로 보고서 전체가 실패하면 안 되므로 호출부가 try/catch 한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CommitClusterCollector {

    /** 최종 노출 클러스터 상한(미분류 제외). 넘치면 커밋 적은 군집을 "기타"로 합친다. */
    private static final int MAX_CLUSTERS = 12;
    private static final int MAX_COMMITS_PER_CLUSTER = 40;
    private static final int MAX_TASKS_PER_CLUSTER = 8;
    private static final int MAX_CHECKLIST_PER_TASK = 15;
    private static final int MAX_CONFLUENCE_PER_CLUSTER = 8;
    /** 이 미만의 커밋을 가진 약한(키워드) 군집은 "기타"로 합쳐 노이즈를 줄인다. */
    private static final int WEAK_CLUSTER_MIN_COMMITS = 2;

    /** "type(scope)!: ..." 에서 type·scope 추출. group(1)=type, group(2)=scope(optional). */
    private static final Pattern TYPE_SCOPE_RE =
            Pattern.compile("^\\s*([a-zA-Z]+)(?:\\(([^)]*)\\))?!?:");

    /** 경로 키 산정 시 건너뛰는 일반 루트 세그먼트 — 의미 없는 상위 디렉터리. */
    private static final Set<String> GENERIC_PATH_SEGMENTS = Set.of(
            "assets", "src", "source", "sources", "scripts", "script", "app", "apps",
            "packages", "package", "lib", "libs", "main", "java", "com", "kanban",
            "backend", "frontend", "client", "server", "unity", "project", "projects");

    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;

    public record ClusterResult(List<ReportContent.Cluster> clusters) {
    }

    /** 매핑 계산용 임시 컨텍스트. */
    private static class Bucket {
        final String key;
        final List<CommitInfo> commits = new ArrayList<>();
        final Set<String> scopes = new LinkedHashSet<>();
        final Set<String> pathKeys = new LinkedHashSet<>();
        final Set<String> tokens = new LinkedHashSet<>();

        Bucket(String key) {
            this.key = key;
        }
    }

    @Transactional(readOnly = true)
    public ClusterResult compute(String boardId, List<CommitInfo> commits,
                                 List<ConfluenceDocInfo> confluenceDocs) {
        List<CommitInfo> safeCommits = commits != null ? commits : List.of();
        List<ConfluenceDocInfo> safeDocs = confluenceDocs != null ? confluenceDocs : List.of();

        // 1) 커밋을 결정론적 키로 그룹핑. 인프라(chore/ci/build/deps)는 별도 버킷.
        Map<String, Bucket> buckets = new LinkedHashMap<>();
        Bucket infra = new Bucket("infra");
        for (CommitInfo c : safeCommits) {
            if (isInfraCommit(c)) {
                infra.commits.add(c);
                continue;
            }
            String key = groupingKey(c);
            Bucket b = buckets.computeIfAbsent(key, Bucket::new);
            b.commits.add(c);
            String scope = scopeOf(c);
            if (scope != null) b.scopes.add(scope);
            String pathKey = pathKey(c);
            if (pathKey != null) b.pathKeys.add(pathKey);
            b.tokens.addAll(commitTokens(c));
        }

        // 2) 약한 군집(키워드 기반 소형)을 "기타"로 병합해 노이즈를 줄인다.
        List<Bucket> ranked = new ArrayList<>(buckets.values());
        ranked.sort(Comparator.comparingInt((Bucket b) -> b.commits.size()).reversed());
        Bucket misc = new Bucket("misc");
        List<Bucket> kept = new ArrayList<>();
        for (Bucket b : ranked) {
            boolean weak = b.scopes.isEmpty() && b.pathKeys.isEmpty()
                    && b.commits.size() < WEAK_CLUSTER_MIN_COMMITS;
            if (weak || kept.size() >= MAX_CLUSTERS) {
                misc.commits.addAll(b.commits);
                misc.tokens.addAll(b.tokens);
            } else {
                kept.add(b);
            }
        }

        // 3) 태스크·체크리스트 후보를 한 번 로드해 키워드 부착에 재사용.
        List<TaskTokens> taskPool = loadTaskPool(boardId);

        // 4) 버킷 → DTO. 커밋 많은 순으로 노출.
        List<ReportContent.Cluster> result = new ArrayList<>();
        for (Bucket b : kept) {
            result.add(toCluster(b, safeDocs, taskPool));
        }
        if (!misc.commits.isEmpty()) {
            result.add(toCluster(misc, safeDocs, taskPool));
        }
        if (!infra.commits.isEmpty()) {
            result.add(toInfraCluster(infra));
        }
        return new ClusterResult(result);
    }

    /** 인프라·빌드·잡무 커밋인지. 기능 군집에서 빼 "미분류·인프라"로 모은다. */
    private boolean isInfraCommit(CommitInfo c) {
        return switch (commitType(c.subject())) {
            case "chore", "ci", "build", "deps" -> true;
            default -> false;
        };
    }

    /**
     * 커밋의 군집 키를 정한다. 우선순위: scope > 파일경로 > 키워드. 어느 것도 없으면 "other".
     * 키가 같은 커밋끼리 한 군집이 된다.
     */
    private String groupingKey(CommitInfo c) {
        String scope = scopeOf(c);
        if (scope != null) {
            return "scope:" + scope;
        }
        String pathKey = pathKey(c);
        if (pathKey != null) {
            return "path:" + pathKey;
        }
        String kw = primaryKeyword(c);
        if (kw != null) {
            return "kw:" + kw;
        }
        return "other";
    }

    /** 컨벤셔널 커밋 scope(소문자). 없으면 null. */
    private String scopeOf(CommitInfo c) {
        if (c.subject() == null) return null;
        Matcher m = TYPE_SCOPE_RE.matcher(c.subject());
        if (m.find() && m.group(2) != null && !m.group(2).isBlank()) {
            return m.group(2).trim().toLowerCase(Locale.ROOT);
        }
        return null;
    }

    /** 커밋 type 접두어(소문자). 없으면 "other". */
    private String commitType(String subject) {
        if (subject == null) return "other";
        Matcher m = TYPE_SCOPE_RE.matcher(subject);
        if (m.find()) return m.group(1).toLowerCase(Locale.ROOT);
        return "other";
    }

    /**
     * 변경 파일들의 공통 상위 경로에서 의미 있는 키를 만든다. 일반 루트(assets, src...)는 건너뛰고
     * 그 다음 1~2개 세그먼트를 이어 키로 쓴다. 예: {@code Assets/Scripts/Battle/Camera/Rig.cs} → {@code battle/camera}.
     * 파일이 없거나 의미 세그먼트를 못 찾으면 null.
     */
    private String pathKey(CommitInfo c) {
        List<String> files = c.filesOrEmpty();
        if (files.isEmpty()) {
            return null;
        }
        List<String> best = null;
        for (String f : files) {
            List<String> segs = meaningfulSegments(f);
            if (segs.isEmpty()) continue;
            if (best == null) {
                best = segs;
            } else {
                best = commonPrefix(best, segs);
                if (best.isEmpty()) break;
            }
        }
        if (best == null || best.isEmpty()) {
            return null;
        }
        int take = Math.min(2, best.size());
        return String.join("/", best.subList(0, take));
    }

    /** 파일 경로에서 디렉터리 세그먼트만(파일명 제외), 일반 루트를 걸러 소문자로. */
    private List<String> meaningfulSegments(String path) {
        if (path == null || path.isBlank()) return List.of();
        String[] raw = path.replace('\\', '/').split("/");
        List<String> segs = new ArrayList<>();
        // 마지막 요소는 파일명이라 제외.
        for (int i = 0; i < raw.length - 1; i++) {
            String s = raw[i].trim().toLowerCase(Locale.ROOT);
            if (s.isEmpty() || GENERIC_PATH_SEGMENTS.contains(s)) continue;
            segs.add(s);
        }
        return segs;
    }

    private List<String> commonPrefix(List<String> a, List<String> b) {
        List<String> out = new ArrayList<>();
        int n = Math.min(a.size(), b.size());
        for (int i = 0; i < n; i++) {
            if (a.get(i).equals(b.get(i))) out.add(a.get(i));
            else break;
        }
        return out;
    }

    /** 제목의 첫 유의미 도메인 토큰(길이 ≥ 3). scope·경로가 전혀 없을 때의 최후 키. 없으면 null. */
    private String primaryKeyword(CommitInfo c) {
        for (String t : tokenize(c.subject())) {
            if (t.length() >= 3) return t;
        }
        return null;
    }

    /** 커밋의 매칭용 토큰(제목 + 본문). scope·경로 키는 별도 신호로 다룬다. */
    private Set<String> commitTokens(CommitInfo c) {
        Set<String> tokens = new LinkedHashSet<>(tokenize(c.subject()));
        tokens.addAll(tokenize(c.bodyOrEmpty()));
        return tokens;
    }

    private List<String> tokenize(String text) {
        if (text == null || text.isBlank()) return List.of();
        List<String> tokens = new ArrayList<>();
        for (String part : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{Nd}]+")) {
            if (part.length() >= 2) tokens.add(part);
        }
        return tokens;
    }

    /** 기능 군집 하나를 DTO로. 신호·신뢰도 산정 후 Confluence·태스크를 키워드로 부착한다. */
    private ReportContent.Cluster toCluster(Bucket b, List<ConfluenceDocInfo> docs, List<TaskTokens> taskPool) {
        List<ReportContent.FeatureCommit> commits = new ArrayList<>();
        for (CommitInfo c : b.commits) {
            if (commits.size() >= MAX_COMMITS_PER_CLUSTER) break;
            commits.add(toCommit(c));
        }

        List<ReportContent.ClusterSignal> signals = new ArrayList<>();
        for (String s : b.scopes) {
            signals.add(ReportContent.ClusterSignal.builder().kind("scope").value(s).build());
        }
        for (String p : b.pathKeys) {
            signals.add(ReportContent.ClusterSignal.builder().kind("path").value(p).build());
        }
        // 키워드 신호: 여러 커밋에 공통으로 나타난 상위 토큰 몇 개(신호가 빈약할 때 보강).
        if (signals.isEmpty()) {
            int added = 0;
            for (String tok : b.tokens) {
                signals.add(ReportContent.ClusterSignal.builder().kind("keyword").value(tok).build());
                if (++added >= 3) break;
            }
        }

        // 신뢰도: scope 또는 (일관된)경로 신호가 있으면 HIGH, 키워드/혼합이면 MID.
        boolean strong = !b.scopes.isEmpty() || b.pathKeys.size() == 1;
        String confidence = strong ? "HIGH" : "MID";

        // Confluence 부착 — 문서 제목 토큰이 군집 토큰과 겹치면.
        List<ReportContent.ConfluenceDoc> confluenceDocs = new ArrayList<>();
        for (ConfluenceDocInfo d : docs) {
            if (confluenceDocs.size() >= MAX_CONFLUENCE_PER_CLUSTER) break;
            if (overlaps(b.tokens, tokenize(d.title()))) {
                confluenceDocs.add(toConfluenceDoc(d));
            }
        }

        // 태스크 부착 — 태스크/체크리스트 토큰이 군집 토큰과 겹치면.
        List<ReportContent.FeatureTask> tasks = new ArrayList<>();
        int taskDone = 0;
        int taskTotal = 0;
        for (TaskTokens t : taskPool) {
            if (tasks.size() >= MAX_TASKS_PER_CLUSTER) break;
            if (overlaps(b.tokens, t.tokens)) {
                tasks.add(t.dto);
                taskDone += t.done;
                taskTotal += t.total;
            }
        }

        return ReportContent.Cluster.builder()
                .key(b.key)
                .title(clusterFallbackTitle(b))
                .summary(null)
                .confidence(confidence)
                .kind(null)
                .signals(signals)
                .commits(commits)
                .confluenceDocs(confluenceDocs)
                .tasks(tasks)
                .taskDone(taskDone)
                .taskTotal(taskTotal)
                .build();
    }

    /** 미분류·인프라 군집 — 기능 아님. 태스크·문서·신뢰도 없이 커밋만 담는다. */
    private ReportContent.Cluster toInfraCluster(Bucket b) {
        List<ReportContent.FeatureCommit> commits = new ArrayList<>();
        for (CommitInfo c : b.commits) {
            if (commits.size() >= MAX_COMMITS_PER_CLUSTER) break;
            commits.add(toCommit(c));
        }
        return ReportContent.Cluster.builder()
                .key("infra")
                .title("미분류 · 인프라")
                .summary("특정 기능에 귀속되지 않는 빌드·설정·의존성 커밋. 활동 기록으로만 남깁니다.")
                .confidence(null)
                .kind("infra")
                .signals(List.of())
                .commits(commits)
                .confluenceDocs(List.of())
                .tasks(List.of())
                .taskDone(0)
                .taskTotal(0)
                .build();
    }

    /** AI 라벨 실패 대비 폴백 제목 — scope/경로/키/기타를 사람이 읽을 형태로. */
    private String clusterFallbackTitle(Bucket b) {
        if (!b.scopes.isEmpty()) {
            return String.join(" · ", b.scopes);
        }
        if (!b.pathKeys.isEmpty()) {
            return b.pathKeys.iterator().next();
        }
        if ("misc".equals(b.key)) {
            return "기타 작업";
        }
        return b.key.startsWith("kw:") ? b.key.substring(3) : b.key;
    }

    private boolean overlaps(Set<String> a, List<String> b) {
        if (a.isEmpty() || b.isEmpty()) return false;
        for (String t : b) {
            if (a.contains(t)) return true;
        }
        return false;
    }

    private ReportContent.FeatureCommit toCommit(CommitInfo c) {
        return ReportContent.FeatureCommit.builder()
                .repo(c.repo())
                .sha(c.sha())
                .subject(c.subject())
                .author(c.author())
                .at(c.at())
                .url(c.url())
                .changedFiles(c.changedFiles())
                .type(commitType(c.subject()))
                .estimated(false)
                .build();
    }

    private ReportContent.ConfluenceDoc toConfluenceDoc(ConfluenceDocInfo doc) {
        return ReportContent.ConfluenceDoc.builder()
                .title(doc.title())
                .url(doc.url())
                .changeType(doc.changeType())
                .author(doc.author())
                .updatedAt(doc.updatedAt())
                .build();
    }

    /** 부착 후보 태스크 하나 — 표시 DTO와 매칭 토큰을 함께 든다. */
    private record TaskTokens(ReportContent.FeatureTask dto, List<String> tokens, int done, int total) {
    }

    /**
     * 보드의 태스크 + 체크리스트를 한 번 로드해 부착 후보로 만든다. 체크리스트가 실제 작업 단위를 드러내므로
     * 태스크 제목 + 체크리스트 제목을 매칭 토큰으로 삼는다.
     */
    private List<TaskTokens> loadTaskPool(String boardId) {
        List<Task> tasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId);
        if (tasks.isEmpty()) {
            return List.of();
        }
        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        Map<String, List<ChecklistItem>> byTask = new HashMap<>();
        for (ChecklistItem item : checklistItemRepository.findByTaskIdInWithAssignee(taskIds)) {
            byTask.computeIfAbsent(item.getTask().getId(), k -> new ArrayList<>()).add(item);
        }

        List<TaskTokens> pool = new ArrayList<>();
        for (Task t : tasks) {
            List<ChecklistItem> items = byTask.getOrDefault(t.getId(), List.of());
            List<String> tokens = new ArrayList<>(tokenize(t.getTitle()));
            int done = 0;
            List<ReportContent.ChecklistLine> lines = new ArrayList<>();
            for (ChecklistItem item : items) {
                tokens.addAll(tokenize(item.getTitle()));
                boolean isDone = Boolean.TRUE.equals(item.getIsCompleted());
                if (isDone) done++;
                if (lines.size() < MAX_CHECKLIST_PER_TASK) {
                    lines.add(ReportContent.ChecklistLine.builder()
                            .title(item.getTitle())
                            .done(isDone)
                            .assignee(item.getAssignee() != null ? item.getAssignee().getName() : null)
                            .build());
                }
            }
            ReportContent.FeatureTask dto = ReportContent.FeatureTask.builder()
                    .title(t.getTitle())
                    .status(Boolean.TRUE.equals(t.getIsCompleted()) ? "DONE" : "IN_PROGRESS")
                    .checklist(lines)
                    .build();
            pool.add(new TaskTokens(dto, tokens, done, items.size()));
        }
        return pool;
    }
}
