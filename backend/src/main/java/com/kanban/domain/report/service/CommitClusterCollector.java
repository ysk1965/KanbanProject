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
 * <p>여기서는 축을 뒤집는다. 커밋을 먼저 읽어 <b>커밋 제목 → 본문 → 변경 파일명</b> 우선순위의 신호로 묶고,
 * (scope는 제목의 구조화된 형태이므로 있으면 최우선) 파일 경로는 무의미한 상위 폴더(예: _project)로 전부
 * 뭉치는 오분류를 낳아 신호에서 제외한다.
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

    /** "type(scope)!: ..." 에서 type·scope 추출. group(1)=type, group(2)=scope(optional). */
    private static final Pattern TYPE_SCOPE_RE =
            Pattern.compile("^\\s*([a-zA-Z]+)(?:\\(([^)]*)\\))?!?:");

    /**
     * 변경 파일명 토큰에서 걸러낼 구조적 접미어 — 기능이 아니라 코드 역할을 나타내는 노이즈.
     * (예: TacticsShopManager.cs → "manager"는 버리고 "tactics"·"shop"만 신호로 쓴다.)
     */
    private static final Set<String> FILENAME_STOPWORDS = Set.of(
            "manager", "controller", "system", "handler", "service", "object", "data",
            "model", "view", "presenter", "component", "base", "helper", "util", "utils",
            "factory", "provider", "config", "settings", "info", "entry", "element", "node",
            "mono", "behaviour", "behavior", "script", "prefab", "asset", "scene", "editor",
            "impl", "dto", "enum", "const", "generated", "designer", "partial", "extension",
            "extensions", "interface", "abstract", "wrapper", "container", "context", "state");

    /**
     * 키워드 군집 키·신호로 쓰기엔 무의미한 커밋 메시지 불용어(동사·타입 접두어). 이런 토큰으로 군집을
     * 이름 지으면("추가", "wip") 의미가 없고, 서로 다른 작업이 같은 흔한 동사로 잘못 뭉친다.
     */
    private static final Set<String> KEYWORD_STOPWORDS = Set.of(
            "추가", "수정", "변경", "삭제", "제거", "개선", "반영", "적용", "구현", "처리",
            "작업", "정리", "보완", "설정", "생성", "업데이트", "리팩터", "리팩토링", "버그", "이슈",
            "add", "fix", "update", "change", "remove", "delete", "refactor", "chore", "feat",
            "wip", "misc", "bug", "issue", "merge", "revert", "test", "tests", "docs", "doc",
            "style", "perf", "build", "init", "temp", "tmp", "and", "the", "for", "with");

    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;

    public record ClusterResult(List<ReportContent.Cluster> clusters) {
    }

    /** 매핑 계산용 임시 컨텍스트. */
    private static class Bucket {
        final String key;
        final List<CommitInfo> commits = new ArrayList<>();
        final Set<String> scopes = new LinkedHashSet<>();
        final Set<String> keywords = new LinkedHashSet<>();
        final Set<String> fileKeys = new LinkedHashSet<>();
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
            // 버킷을 만든 근거(키)를 신호로 되살린다: scope / 제목·본문 키워드 / 파일명 중 하나.
            if (key.startsWith("scope:")) b.scopes.add(key.substring(6));
            else if (key.startsWith("kw:")) b.keywords.add(key.substring(3));
            else if (key.startsWith("file:")) b.fileKeys.add(key.substring(5));
            b.tokens.addAll(commitTokens(c));
        }

        // 1.5) 2차 병합 — scope 군집과, 그 scope명을 키워드/파일명/토큰에 담은 군집을 합친다.
        // (예: scope:battle ← kw:battle). 컨벤셔널 커밋을 일관되게 안 쓰는 저장소에서 한 기능이
        // scope 군집과 키워드 군집으로 쪼개지던 파편화를 없앤다.
        mergeIntoScopes(buckets);

        // 2) 신호 없는 "기타(other)" 군집과 상한 초과분만 "기타"로 병합한다. 제목·본문 키워드가 이제
        //    1차 신호이므로 커밋 1건짜리 키워드 군집도 유효한 기능으로 남긴다(예전처럼 소형이라 버리지 않는다).
        List<Bucket> ranked = new ArrayList<>(buckets.values());
        ranked.sort(Comparator.comparingInt((Bucket b) -> b.commits.size()).reversed());
        Bucket misc = new Bucket("misc");
        List<Bucket> kept = new ArrayList<>();
        int mergedToMisc = 0;
        for (Bucket b : ranked) {
            if ("other".equals(b.key) || kept.size() >= MAX_CLUSTERS) {
                misc.commits.addAll(b.commits);
                misc.tokens.addAll(b.tokens);
                mergedToMisc++;
            } else {
                kept.add(b);
            }
        }
        // 조용한 절단 금지 — 몇 개 군집이 "기타"로 합쳐졌는지 남긴다.
        if (mergedToMisc > 0) {
            log.debug("클러스터 집계 board={}: 약하거나 상한 초과한 군집 {}개를 기타로 병합", boardId, mergedToMisc);
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

    /**
     * scope 군집을 앵커로, 그 scope명을 경로 세그먼트나 토큰에 담은 경로·키워드 군집을 합친다.
     * scope 군집이 없으면 아무것도 하지 않는다(경로·키워드 군집끼리는 병합하지 않는다 — 근거가 약하다).
     */
    private void mergeIntoScopes(Map<String, Bucket> buckets) {
        List<Bucket> scopeBuckets = new ArrayList<>();
        for (Bucket b : buckets.values()) {
            if (b.key.startsWith("scope:")) {
                scopeBuckets.add(b);
            }
        }
        if (scopeBuckets.isEmpty()) {
            return;
        }
        List<String> removeKeys = new ArrayList<>();
        for (Bucket b : buckets.values()) {
            if (b.key.startsWith("scope:")) {
                continue;
            }
            Bucket target = findScopeMatch(b, scopeBuckets);
            if (target != null) {
                target.commits.addAll(b.commits);
                target.scopes.addAll(b.scopes);
                target.keywords.addAll(b.keywords);
                target.fileKeys.addAll(b.fileKeys);
                target.tokens.addAll(b.tokens);
                removeKeys.add(b.key);
            }
        }
        removeKeys.forEach(buckets::remove);
    }

    /** 키워드·파일명 군집 b가 어떤 scope 군집에 속하는지 — scope명이 b의 키워드/파일명/토큰에 있으면 그 군집. */
    private Bucket findScopeMatch(Bucket b, List<Bucket> scopeBuckets) {
        for (Bucket s : scopeBuckets) {
            for (String scope : s.scopes) {
                if (scope.length() < 3) {
                    continue; // 너무 짧은 scope는 우연 일치 위험이 커 앵커로 안 쓴다
                }
                if (b.keywords.contains(scope) || b.fileKeys.contains(scope) || b.tokens.contains(scope)) {
                    return s;
                }
            }
        }
        return null;
    }

    /** 인프라·빌드·잡무 커밋인지. 기능 군집에서 빼 "미분류·인프라"로 모은다. */
    private boolean isInfraCommit(CommitInfo c) {
        return switch (commitType(c.subject())) {
            case "chore", "ci", "build", "deps" -> true;
            default -> false;
        };
    }

    /**
     * 커밋의 군집 키를 정한다. 우선순위: <b>커밋 제목 → 본문 → 변경 파일명</b>. 어느 것도 없으면 "other".
     * scope(예: {@code feat(shop):})는 제목의 구조화된 형태이므로 있으면 최우선으로 쓴다. 파일 경로는
     * 무의미한 상위 폴더로 전부 뭉치는 오분류를 낳아 키에서 제외한다. 키가 같은 커밋끼리 한 군집이 된다.
     */
    private String groupingKey(CommitInfo c) {
        String scope = scopeOf(c);
        if (scope != null) {
            return "scope:" + scope;
        }
        String titleKw = primaryKeyword(stripCommitPrefix(c.subject()));
        if (titleKw != null) {
            return "kw:" + titleKw;
        }
        String bodyKw = primaryKeyword(c.bodyOrEmpty());
        if (bodyKw != null) {
            return "kw:" + bodyKw;
        }
        String fileKw = fileKey(c);
        if (fileKw != null) {
            return "file:" + fileKw;
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

    /**
     * 제목 앞머리의 "type:" 또는 "type(scope):" 접두어를 떼어낸다. 오타·비표준 타입("refator:", "hotfix:")도
     * 함께 벗겨 그 토큰이 기능 키워드로 오인되는 걸 막는다. 접두어가 없으면 원문 그대로.
     */
    private String stripCommitPrefix(String subject) {
        if (subject == null) {
            return "";
        }
        Matcher m = TYPE_SCOPE_RE.matcher(subject);
        if (m.find() && m.start() == 0) {
            return subject.substring(m.end());
        }
        return subject;
    }

    /** 커밋 type 접두어(소문자). 없으면 "other". */
    private String commitType(String subject) {
        if (subject == null) return "other";
        Matcher m = TYPE_SCOPE_RE.matcher(subject);
        if (m.find()) return m.group(1).toLowerCase(Locale.ROOT);
        return "other";
    }

    /**
     * 변경 파일들의 <b>파일명</b>(경로·확장자 제외)에서 가장 자주 나오는 유의미 토큰을 키로 만든다. 경로는
     * 무시한다 — 예: {@code Assets/_Project/Battle/TacticsShopSlot.cs} → 파일명 {@code TacticsShopSlot}만 보고
     * {@code tactics}/{@code shop}/{@code slot} 중 최빈 토큰. 파일이 없거나 유의미 토큰이 없으면 null.
     */
    private String fileKey(CommitInfo c) {
        Map<String, Integer> freq = new LinkedHashMap<>();
        for (String f : c.filesOrEmpty()) {
            for (String t : fileNameTokens(f)) {
                if (isMeaningfulFileToken(t)) {
                    freq.merge(t, 1, Integer::sum);
                }
            }
        }
        String best = null;
        int bestCount = 0;
        for (Map.Entry<String, Integer> e : freq.entrySet()) {
            if (e.getValue() > bestCount) { // 동점이면 먼저 나온(파일명 앞쪽) 토큰 유지
                best = e.getKey();
                bestCount = e.getValue();
            }
        }
        return best;
    }

    /** 파일 경로에서 파일명만 취해 camelCase·구분자 경계로 소문자 토큰화. 예: {@code TacticsShopSlot.cs} → [tactics, shop, slot]. */
    private List<String> fileNameTokens(String path) {
        if (path == null || path.isBlank()) return List.of();
        String norm = path.replace('\\', '/');
        String base = norm.substring(norm.lastIndexOf('/') + 1);
        int dot = base.lastIndexOf('.');
        if (dot > 0) base = base.substring(0, dot); // 확장자 제거
        // camelCase/PascalCase 경계에 공백을 넣어 토큰을 나눈다.
        String spaced = base.replaceAll("([\\p{Ll}\\p{Nd}])([\\p{Lu}])", "$1 $2");
        List<String> tokens = new ArrayList<>();
        for (String part : spaced.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{Nd}]+")) {
            if (!part.isBlank()) tokens.add(part);
        }
        return tokens;
    }

    /** 파일명 토큰이 기능 신호로 쓸 만한지 — 구조적 접미어·불용어·너무 짧은 토큰은 제외. */
    private boolean isMeaningfulFileToken(String t) {
        return t.length() >= 3 && !FILENAME_STOPWORDS.contains(t) && !KEYWORD_STOPWORDS.contains(t);
    }

    /** 텍스트(제목/본문)의 첫 유의미 도메인 토큰. 없으면 null. */
    private String primaryKeyword(String text) {
        for (String t : tokenize(text)) {
            if (isMeaningfulKeyword(t)) {
                return t;
            }
        }
        return null;
    }

    /** 군집 키·신호로 쓸 만한 커밋 메시지 토큰인지. 한글은 2음절부터(알림·광고·상점…), 그 외는 3자 이상 의미로 본다. */
    private boolean isMeaningfulKeyword(String t) {
        if (KEYWORD_STOPWORDS.contains(t)) {
            return false;
        }
        return containsHangul(t) ? t.length() >= 2 : t.length() >= 3;
    }

    /** 토큰에 한글 음절(가–힣)이 하나라도 있는지. */
    private boolean containsHangul(String t) {
        for (int i = 0; i < t.length(); i++) {
            char ch = t.charAt(i);
            if (ch >= '가' && ch <= '힣') {
                return true;
            }
        }
        return false;
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
        for (String kw : b.keywords) {
            signals.add(ReportContent.ClusterSignal.builder().kind("keyword").value(kw).build());
        }
        for (String fk : b.fileKeys) {
            signals.add(ReportContent.ClusterSignal.builder().kind("file").value(fk).build());
        }
        // 신호가 빈약하면(예: 파편이 misc로 뭉친 경우) 공통 토큰 몇 개로 보강. 불용어는 제외.
        if (signals.isEmpty()) {
            int added = 0;
            for (String tok : b.tokens) {
                if (!isMeaningfulKeyword(tok)) {
                    continue;
                }
                signals.add(ReportContent.ClusterSignal.builder().kind("keyword").value(tok).build());
                if (++added >= 3) break;
            }
        }

        // 신뢰도: scope가 있거나 같은 신호를 2건 이상 커밋이 공유하면 HIGH(교차 근거), 단일 커밋이면 MID.
        boolean strong = !b.scopes.isEmpty() || b.commits.size() >= 2;
        String confidence = strong ? "HIGH" : "MID";

        // Confluence 부착 — 제목이 군집 토큰과 유의미하게 겹칠 때만(단일 흔한 단어 매칭 방지).
        List<ReportContent.ConfluenceDoc> confluenceDocs = new ArrayList<>();
        for (ConfluenceDocInfo d : docs) {
            if (confluenceDocs.size() >= MAX_CONFLUENCE_PER_CLUSTER) break;
            if (attaches(b.tokens, tokenize(d.title()))) {
                confluenceDocs.add(toConfluenceDoc(d));
            }
        }

        // 태스크 부착 — 태스크/체크리스트 토큰이 군집 토큰과 유의미하게 겹칠 때만.
        List<ReportContent.FeatureTask> tasks = new ArrayList<>();
        int taskDone = 0;
        int taskTotal = 0;
        for (TaskTokens t : taskPool) {
            if (tasks.size() >= MAX_TASKS_PER_CLUSTER) break;
            if (attaches(b.tokens, t.tokens)) {
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

    /** AI 라벨 실패 대비 폴백 제목 — scope/키워드/파일명/기타를 사람이 읽을 형태로. */
    private String clusterFallbackTitle(Bucket b) {
        if (!b.scopes.isEmpty()) {
            return String.join(" · ", b.scopes);
        }
        if (!b.keywords.isEmpty()) {
            return b.keywords.iterator().next();
        }
        if (!b.fileKeys.isEmpty()) {
            return b.fileKeys.iterator().next();
        }
        if ("misc".equals(b.key)) {
            return "기타 작업";
        }
        return b.key.startsWith("kw:") ? b.key.substring(3)
                : b.key.startsWith("file:") ? b.key.substring(5) : b.key;
    }

    /**
     * 후보(태스크·문서) 토큰이 군집 토큰과 <b>유의미하게</b> 겹치는지. 단일 흔한 단어("버튼"·"수정") 하나로
     * 무관한 태스크가 끌려오는 오부착을 막는다. 규칙: 특정성 높은 단일 토큰(길이 ≥ 5) 매칭이면 즉시 성립,
     * 아니면 불용어·짧은 토큰을 뺀 유의미 겹침이 2개 이상이어야 성립.
     */
    private boolean attaches(Set<String> clusterTokens, List<String> candidate) {
        if (clusterTokens.isEmpty() || candidate == null || candidate.isEmpty()) {
            return false;
        }
        int significant = 0;
        for (String t : candidate) {
            if (t.length() < 3 || KEYWORD_STOPWORDS.contains(t) || !clusterTokens.contains(t)) {
                continue;
            }
            if (t.length() >= 5) {
                return true;
            }
            if (++significant >= 2) {
                return true;
            }
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
