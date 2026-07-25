package com.kanban.domain.report.service;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.FeatureStatus;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 보고서의 "기능별 진행 현황"과 "스프린트 진행" 블록을 <b>시스템이 직접 집계</b>한다.
 *
 * <p>지표(metrics)와 같은 원칙 — 숫자·상태를 AI에 맡기지 않는다. feature/task/sprint 도메인의
 * 비정규화 카운터와 FK(Task.feature_id, ChecklistItem.sprint_id)를 그대로 읽어 정확한 값을 만든다.
 *
 * <p>이 집계는 <b>best-effort</b>다. 여기서 나는 예외로 보고서 전체가 실패하면 안 되므로,
 * feature/sprint 각각을 독립적으로 try/catch 하고 실패 시 부분/빈 결과를 돌려준다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BoardProgressCollector {

    private static final int MAX_FEATURES = 15;
    private static final int MAX_TASKS_PER_FEATURE = 10;
    private static final int MAX_CHECKLIST_PER_TASK = 15;
    private static final int MAX_COMMITS_PER_FEATURE = 30;
    private static final int MAX_COMMITS_PER_CATEGORY = 40;
    private static final int MAX_CONFLUENCE_PER_FEATURE = 12;

    /** 컨벤셔널 커밋 접두어 판별 — "type(scope)!: ..." 의 type 추출 */
    private static final Pattern TYPE_RE = Pattern.compile("^\\s*([a-zA-Z]+)(?:\\([^)]*\\))?!?:");

    /** 잔여 커밋 카테고리 순서와 라벨 (key, label) */
    private static final List<String[]> CATEGORY_ORDER = List.of(
            new String[]{"fix", "버그 수정"},
            new String[]{"refactor", "리팩터링·개선"},
            new String[]{"chore", "인프라·설정"},
            new String[]{"feat", "기능"},
            new String[]{"docs", "문서·테스트"},
            new String[]{"other", "기타"}
    );

    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final SprintRepository sprintRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BoardMemberRepository boardMemberRepository;

    public record Progress(ReportContent.Sprint sprint,
                           List<ReportContent.Feature> features,
                           List<ReportContent.CommitCategory> commitCategories,
                           List<CommitInfo> leftover,
                           List<CommitInfo> choreCommits) {
    }

    /** 파싱된 커밋 하나(표시·매칭에 필요한 필드만). ReportComposer가 GITHUB 소스에서 만들어 넘긴다. */
    public record CommitInfo(String repo, String sha, String subject, String body, String author,
                             String at, String url, Integer changedFiles, List<String> files) {
        /** null-safe 파일 목록 접근자. 상세 조회 전이면 빈 목록. */
        public List<String> filesOrEmpty() {
            return files != null ? files : List.of();
        }

        /** null-safe 커밋 본문 접근자. 본문이 없으면 빈 문자열. */
        public String bodyOrEmpty() {
            return body != null ? body : "";
        }
    }

    /** 파싱된 Confluence 문서 하나. ReportComposer가 CONFLUENCE 변경내역에서 만들어 넘긴다. */
    public record ConfluenceDocInfo(String title, String url, String changeType,
                                    String author, String updatedAt) {
    }

    private record FeatureResult(List<ReportContent.Feature> features,
                                 List<ReportContent.CommitCategory> categories,
                                 List<CommitInfo> leftover,
                                 List<CommitInfo> chore) {
    }

    @Transactional(readOnly = true)
    public Progress compute(String boardId, ReportPeriod period, List<CommitInfo> commits,
                            List<ConfluenceDocInfo> confluenceDocs) {
        List<ReportContent.Feature> features = List.of();
        List<ReportContent.CommitCategory> categories = List.of();
        List<CommitInfo> leftover = List.of();
        List<CommitInfo> chore = List.of();
        try {
            FeatureResult fr = computeFeatures(boardId, period,
                    commits != null ? commits : List.of(),
                    confluenceDocs != null ? confluenceDocs : List.of());
            features = fr.features();
            categories = fr.categories();
            leftover = fr.leftover();
            chore = fr.chore();
        } catch (Exception e) {
            log.warn("기능별 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        ReportContent.Sprint sprint = null;
        try {
            sprint = computeSprint(boardId);
        } catch (Exception e) {
            log.warn("스프린트 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        return new Progress(sprint, features, categories, leftover, chore);
    }

    /** 진행 중 feature + 기간 내 완료된 feature. lastActivity 내림차순, 최대 {@value #MAX_FEATURES}개. */
    private FeatureResult computeFeatures(String boardId, ReportPeriod period, List<CommitInfo> commits,
                                          List<ConfluenceDocInfo> confluenceDocs) {
        LocalDateTime startUtc = period.startInclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endUtc = period.endExclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        // 커밋 author(github 로그인) → 기능 매칭을 위해 보드 멤버의 github_login을 미리 로드.
        Map<String, String> loginByUserId = new HashMap<>();
        for (BoardMember bm : boardMemberRepository.findByBoardId(boardId)) {
            if (bm.getUser() != null && bm.getGithubLogin() != null && !bm.getGithubLogin().isBlank()) {
                loginByUserId.put(bm.getUser().getId(), bm.getGithubLogin().toLowerCase(Locale.ROOT));
            }
        }

        Map<String, Feature> byId = new LinkedHashMap<>();
        for (Feature f : featureRepository.findByBoardIdAndStatus(boardId, FeatureStatus.ACTIVE)) {
            byId.put(f.getId(), f);
        }
        for (Feature f : featureRepository.findByBoardIdAndStatusAndCompletedAtBetween(
                boardId, FeatureStatus.COMPLETED, startUtc, endUtc)) {
            byId.putIfAbsent(f.getId(), f);
        }

        List<Ctx> ctxs = new ArrayList<>();
        for (Feature f : byId.values()) {
            List<Task> tasks = taskRepository.findByFeatureIdOrderByPositionAsc(f.getId());

            // 체크리스트를 태스크별로 한 번에 로드해 두 용도(표시 DTO·매칭 토큰)로 함께 쓴다.
            Map<String, List<ChecklistItem>> checklistByTask = loadChecklistByTask(tasks);

            LocalDateTime lastActivity = tasks.stream()
                    .map(Task::getCompletedAt)
                    .filter(java.util.Objects::nonNull)
                    .max(Comparator.naturalOrder())
                    .orElse(f.getCompletedAt() != null ? f.getCompletedAt() : f.getUpdatedAt());

            List<String> assignees = new ArrayList<>();
            if (f.getAssignee() != null && f.getAssignee().getName() != null) {
                assignees.add(f.getAssignee().getName());
            }
            if (f.getContractor() != null && f.getContractor().getName() != null) {
                assignees.add(f.getContractor().getName());
            }

            List<ReportContent.FeatureTask> taskDtos = tasks.stream()
                    .limit(MAX_TASKS_PER_FEATURE)
                    .map(t -> ReportContent.FeatureTask.builder()
                            .title(t.getTitle())
                            .status(taskStatus(t, today))
                            .checklist(toChecklistLines(checklistByTask.get(t.getId())))
                            .build())
                    .toList();

            ReportContent.Feature dto = ReportContent.Feature.builder()
                    .name(f.getTitle())
                    .status(f.getStatus() == FeatureStatus.COMPLETED ? "DONE" : "IN_PROGRESS")
                    .description(f.getDescription())
                    .taskDone(f.getCompletedTasks() != null ? f.getCompletedTasks() : 0)
                    .taskTotal(f.getTotalTasks() != null ? f.getTotalTasks() : 0)
                    .assignees(assignees)
                    .lastActivity(lastActivity != null ? lastActivity.toString() : null)
                    .tasks(taskDtos)
                    .commits(new ArrayList<>())
                    .confluenceDocs(new ArrayList<>())
                    .build();

            Set<String> logins = new HashSet<>();
            if (f.getAssignee() != null) {
                String l = loginByUserId.get(f.getAssignee().getId());
                if (l != null) logins.add(l);
            }
            if (f.getContractor() != null && f.getContractor().getGithubLogin() != null
                    && !f.getContractor().getGithubLogin().isBlank()) {
                logins.add(f.getContractor().getGithubLogin().toLowerCase(Locale.ROOT));
            }

            Ctx ctx = new Ctx();
            ctx.dto = dto;
            ctx.logins = logins;
            ctx.tokens = buildMatchTokens(f, tasks, checklistByTask);
            ctxs.add(ctx);
        }

        // 커밋 → 기능 상관: author 로그인이 단일 기능과 맞으면 확정. 나머지는 잔여로 모아 AI가 의미 배정(추정)한다.
        // 단, 인프라·빌드·잡무(chore/ci/build/deps) 커밋은 기능에 귀속하지 않는다 — 담당자가 한 기능만 맡았어도
        // 그 사람의 잡무 커밋까지 그 기능 "작업"으로 잡히던 오귀속을 막는다. 카테고리에는 남겨 활동은 보이게 한다.
        List<CommitInfo> leftover = new ArrayList<>();
        List<CommitInfo> chore = new ArrayList<>();
        for (CommitInfo c : commits) {
            if (isNonFeatureCommit(c)) {
                chore.add(c);
                continue;
            }
            Hit hit = attribute(c, ctxs);
            if (hit != null) {
                if (hit.ctx().bucket.size() < MAX_COMMITS_PER_FEATURE) {
                    hit.ctx().bucket.add(toCommit(c, hit.estimated()));
                }
            } else {
                leftover.add(c);
            }
        }

        // Confluence 문서 → 기능 상관: 문서 제목 키워드로만 매핑(작성자 계정은 github 로그인과 별개라 신뢰 못 함).
        // 매칭 안 되면 기능에 붙이지 않는다 — 전역 Confluence 탭엔 이미 다 나오므로 여기선 확실한 것만 건다.
        for (ConfluenceDocInfo doc : confluenceDocs) {
            Ctx match = matchConfluence(doc, ctxs);
            if (match != null && match.confluenceBucket.size() < MAX_CONFLUENCE_PER_FEATURE) {
                match.confluenceBucket.add(toConfluenceDoc(doc));
            }
        }

        List<ReportContent.Feature> result = new ArrayList<>();
        for (Ctx ctx : ctxs) {
            ctx.dto.setCommits(ctx.bucket);
            ctx.dto.setConfluenceDocs(ctx.confluenceBucket);
            result.add(ctx.dto);
        }
        result.sort(Comparator.comparing(ReportContent.Feature::getLastActivity,
                Comparator.nullsLast(Comparator.reverseOrder())));
        if (result.size() > MAX_FEATURES) {
            result = new ArrayList<>(result.subList(0, MAX_FEATURES));
        }

        // 카테고리(미분류 커밋 목록)에는 잔여 + 잡무 커밋을 모두 담는다 — 기능엔 안 붙어도 무엇을 했는지는 남긴다.
        List<CommitInfo> categoryPool = new ArrayList<>(leftover);
        categoryPool.addAll(chore);
        return new FeatureResult(result, buildCategories(categoryPool), leftover, chore);
    }

    /**
     * 인프라·빌드·잡무 타입(chore/ci/build/deps) 커밋인지. 특정 기능의 작업으로 보기 어려워 기능 귀속에서 뺀다.
     * (카테고리 집계에는 그대로 들어간다 — {@link #categoryKey}가 같은 타입을 "인프라·설정"으로 묶는다.)
     */
    private boolean isNonFeatureCommit(CommitInfo c) {
        return switch (commitType(c.subject())) {
            case "chore", "ci", "build", "deps" -> true;
            default -> false;
        };
    }

    /**
     * 커밋 하나를 기능에 <b>확정</b> 매핑한다. 커밋 author의 GitHub 로그인이 정확히 한 기능의
     * 담당자와 맞을 때만 확정(estimated=false)으로 붙인다 — 유일하게 정밀도가 높은 신호다.
     *
     * <p>그 외(담당자 매칭 0개 또는 복수 기능에 걸침)는 여기서 붙이지 않고 null을 돌려 잔여로 넘긴다.
     * 잔여 커밋은 {@code ReportComposer}가 파일 경로·태스크를 근거로 AI에 의미 배정(추정)시킨다.
     * 얕은 키워드 substring 매칭은 노이즈가 커서 폐기했다.
     */
    private Hit attribute(CommitInfo c, List<Ctx> ctxs) {
        String author = c.author() == null ? null : c.author().toLowerCase(Locale.ROOT);
        if (author == null) {
            return null;
        }
        List<Ctx> byAuthor = new ArrayList<>();
        for (Ctx x : ctxs) {
            if (x.logins.contains(author)) byAuthor.add(x);
        }
        return byAuthor.size() == 1 ? new Hit(byAuthor.get(0), false) : null;
    }

    private List<String> tokenize(String title) {
        if (title == null || title.isBlank()) return List.of();
        List<String> tokens = new ArrayList<>();
        for (String part : title.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{Nd}]+")) {
            if (part.length() >= 2) tokens.add(part);
        }
        return tokens;
    }

    /** 커밋 키워드 매칭 후보 어휘 상한 — 한 기능에 너무 많은 토큰이 붙어 아무 커밋이나 걸리는 걸 막는다. */
    private static final int MAX_MATCH_TOKENS = 80;

    /**
     * 기능 매칭용 키워드 집합. 기능 제목만으로는 부족하다 — 실제 작업 단위는 <b>태스크와 그 안의 체크리스트</b>에
     * 적혀 있어서, 커밋 메시지가 체크리스트 항목 이름과 겹치는 경우가 많다. 셋을 모두 어휘로 삼아 매칭 정확도를 높인다.
     * 체크리스트는 이미 로드해 둔 것을 재사용한다(태스크별 표시 DTO와 같은 데이터).
     */
    private List<String> buildMatchTokens(Feature f, List<Task> tasks,
                                          Map<String, List<ChecklistItem>> checklistByTask) {
        Set<String> tokens = new LinkedHashSet<>(tokenize(f.getTitle()));
        for (Task t : tasks) {
            tokens.addAll(tokenize(t.getTitle()));
        }
        outer:
        for (List<ChecklistItem> items : checklistByTask.values()) {
            for (ChecklistItem item : items) {
                tokens.addAll(tokenize(item.getTitle()));
                if (tokens.size() >= MAX_MATCH_TOKENS) {
                    break outer;
                }
            }
        }
        List<String> result = new ArrayList<>(tokens);
        return result.size() > MAX_MATCH_TOKENS ? result.subList(0, MAX_MATCH_TOKENS) : result;
    }

    /** 태스크별 체크리스트를 한 번의 쿼리로 로드해 task_id로 묶는다. 태스크가 없으면 빈 맵. */
    private Map<String, List<ChecklistItem>> loadChecklistByTask(List<Task> tasks) {
        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        Map<String, List<ChecklistItem>> byTask = new HashMap<>();
        if (taskIds.isEmpty()) {
            return byTask;
        }
        for (ChecklistItem item : checklistItemRepository.findByTaskIdInWithAssignee(taskIds)) {
            // getTask().getId()는 FK 값이라 프록시를 초기화하지 않고 얻는다(추가 쿼리 없음).
            byTask.computeIfAbsent(item.getTask().getId(), k -> new ArrayList<>()).add(item);
        }
        return byTask;
    }

    /** 체크리스트 항목을 표시용 DTO로. 순서는 로드된 순서(position 정렬은 저장소에 위임). 태스크당 상한 적용. */
    private List<ReportContent.ChecklistLine> toChecklistLines(List<ChecklistItem> items) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        return items.stream()
                .limit(MAX_CHECKLIST_PER_TASK)
                .map(it -> ReportContent.ChecklistLine.builder()
                        .title(it.getTitle())
                        .done(Boolean.TRUE.equals(it.getIsCompleted()))
                        .assignee(it.getAssignee() != null ? it.getAssignee().getName() : null)
                        .build())
                .toList();
    }

    /** Confluence 문서 하나를 문서 제목 키워드로 기능에 매핑한다. 삭제 문서 포함(제목만 있어도 매칭). 없으면 null. */
    private Ctx matchConfluence(ConfluenceDocInfo doc, List<Ctx> ctxs) {
        List<String> docTokens = tokenize(doc.title());
        if (docTokens.isEmpty()) {
            return null;
        }
        for (Ctx x : ctxs) {
            if (x.tokens.isEmpty()) {
                continue;
            }
            for (String tok : docTokens) {
                if (x.tokens.contains(tok)) {
                    return x;
                }
            }
        }
        return null;
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

    public ReportContent.FeatureCommit toCommit(CommitInfo c, boolean estimated) {
        return ReportContent.FeatureCommit.builder()
                .repo(c.repo())
                .sha(c.sha())
                .subject(c.subject())
                .author(c.author())
                .at(c.at())
                .url(c.url())
                .changedFiles(c.changedFiles())
                .type(commitType(c.subject()))
                .estimated(estimated)
                .build();
    }

    private String commitType(String subject) {
        if (subject == null) return "other";
        Matcher m = TYPE_RE.matcher(subject);
        if (m.find()) return m.group(1).toLowerCase(Locale.ROOT);
        return "other";
    }

    private String categoryKey(String type) {
        return switch (type) {
            case "fix" -> "fix";
            case "feat" -> "feat";
            case "refactor", "perf", "style" -> "refactor";
            case "chore", "ci", "build", "deps" -> "chore";
            case "docs", "test" -> "docs";
            default -> "other";
        };
    }

    public List<ReportContent.CommitCategory> buildCategories(List<CommitInfo> leftover) {
        if (leftover.isEmpty()) return List.of();
        Map<String, List<ReportContent.FeatureCommit>> byKey = new LinkedHashMap<>();
        for (CommitInfo c : leftover) {
            String key = categoryKey(commitType(c.subject()));
            List<ReportContent.FeatureCommit> list = byKey.computeIfAbsent(key, k -> new ArrayList<>());
            if (list.size() < MAX_COMMITS_PER_CATEGORY) list.add(toCommit(c, false));
        }
        List<ReportContent.CommitCategory> categories = new ArrayList<>();
        for (String[] cat : CATEGORY_ORDER) {
            List<ReportContent.FeatureCommit> list = byKey.get(cat[0]);
            if (list != null && !list.isEmpty()) {
                categories.add(ReportContent.CommitCategory.builder()
                        .key(cat[0]).label(cat[1]).commits(list).build());
            }
        }
        return categories;
    }

    /** 매핑 계산용 임시 컨텍스트 — dto와 매칭에 필요한 로그인/토큰/버킷을 함께 든다. */
    private static class Ctx {
        ReportContent.Feature dto;
        Set<String> logins;
        List<String> tokens;
        final List<ReportContent.FeatureCommit> bucket = new ArrayList<>();
        final List<ReportContent.ConfluenceDoc> confluenceBucket = new ArrayList<>();
    }

    private record Hit(Ctx ctx, boolean estimated) {
    }

    /** isCompleted면 DONE, 시작일이 지났으면 IN_PROGRESS, 아니면 TODO. */
    private String taskStatus(Task t, LocalDate today) {
        if (Boolean.TRUE.equals(t.getIsCompleted())) {
            return "DONE";
        }
        if (t.getStartDate() != null && !t.getStartDate().isAfter(today)) {
            return "IN_PROGRESS";
        }
        return "TODO";
    }

    /** 보드의 활성 스프린트 게이지(done/total/inProgress/delayed). 활성 스프린트 없으면 null. */
    private ReportContent.Sprint computeSprint(String boardId) {
        List<Sprint> active = sprintRepository.findByBoardIdAndStatus(boardId, SprintStatus.ACTIVE);
        if (active.isEmpty()) {
            return null;
        }
        Sprint sprint = active.get(0); // 최신 시퀀스 우선
        List<ChecklistItem> items = checklistItemRepository.findBySprintId(sprint.getId());
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        int total = items.size();
        int done = 0;
        int delayed = 0;
        int inProgress = 0;
        for (ChecklistItem it : items) {
            boolean isDone = Boolean.TRUE.equals(it.getIsCompleted())
                    || (it.getSprintColumn() != null && it.getSprintColumn().getKind() == SprintColumnKind.END);
            if (isDone) {
                done++;
                continue;
            }
            if (it.getDueDate() != null && it.getDueDate().isBefore(today)) {
                delayed++;
                continue;
            }
            boolean inMiddle = it.getSprintColumn() != null
                    && it.getSprintColumn().getKind() == SprintColumnKind.MIDDLE;
            boolean started = it.getStartDate() != null && !it.getStartDate().isAfter(today);
            if (inMiddle || started) {
                inProgress++;
            }
            // 그 외는 미착수 — 별도 버킷 없이 total에만 포함
        }

        int percentage = total == 0 ? 0 : (int) Math.round(done * 100.0 / total);
        return ReportContent.Sprint.builder()
                .name(sprint.getName())
                .milestone(sprint.getMilestone() != null ? sprint.getMilestone().getTitle() : null)
                .status("IN_PROGRESS")
                .done(done)
                .total(total)
                .inProgress(inProgress)
                .delayed(delayed)
                .percentage(percentage)
                .build();
    }
}
