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
    private static final int MAX_COMMITS_PER_FEATURE = 30;
    private static final int MAX_COMMITS_PER_CATEGORY = 40;

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
                           List<CommitInfo> leftover) {
    }

    /** 파싱된 커밋 하나(표시·매칭에 필요한 필드만). ReportComposer가 GITHUB 소스에서 만들어 넘긴다. */
    public record CommitInfo(String repo, String sha, String subject, String author,
                             String at, String url, Integer changedFiles) {
    }

    private record FeatureResult(List<ReportContent.Feature> features,
                                 List<ReportContent.CommitCategory> categories,
                                 List<CommitInfo> leftover) {
    }

    @Transactional(readOnly = true)
    public Progress compute(String boardId, ReportPeriod period, List<CommitInfo> commits) {
        List<ReportContent.Feature> features = List.of();
        List<ReportContent.CommitCategory> categories = List.of();
        List<CommitInfo> leftover = List.of();
        try {
            FeatureResult fr = computeFeatures(boardId, period, commits != null ? commits : List.of());
            features = fr.features();
            categories = fr.categories();
            leftover = fr.leftover();
        } catch (Exception e) {
            log.warn("기능별 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        ReportContent.Sprint sprint = null;
        try {
            sprint = computeSprint(boardId);
        } catch (Exception e) {
            log.warn("스프린트 진행 집계 실패 board={}: {}", boardId, e.getMessage());
        }

        return new Progress(sprint, features, categories, leftover);
    }

    /** 진행 중 feature + 기간 내 완료된 feature. lastActivity 내림차순, 최대 {@value #MAX_FEATURES}개. */
    private FeatureResult computeFeatures(String boardId, ReportPeriod period, List<CommitInfo> commits) {
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
            ctx.tokens = buildMatchTokens(f, tasks);
            ctxs.add(ctx);
        }

        // 커밋 → 기능 상관: (1) 연결된 담당자 로그인 (2) 커밋 메시지 키워드. 못 붙이면 카테고리로.
        List<CommitInfo> leftover = new ArrayList<>();
        for (CommitInfo c : commits) {
            Hit hit = attribute(c, ctxs);
            if (hit != null) {
                if (hit.ctx().bucket.size() < MAX_COMMITS_PER_FEATURE) {
                    hit.ctx().bucket.add(toCommit(c, hit.estimated()));
                }
            } else {
                leftover.add(c);
            }
        }

        List<ReportContent.Feature> result = new ArrayList<>();
        for (Ctx ctx : ctxs) {
            ctx.dto.setCommits(ctx.bucket);
            result.add(ctx.dto);
        }
        result.sort(Comparator.comparing(ReportContent.Feature::getLastActivity,
                Comparator.nullsLast(Comparator.reverseOrder())));
        if (result.size() > MAX_FEATURES) {
            result = new ArrayList<>(result.subList(0, MAX_FEATURES));
        }

        return new FeatureResult(result, buildCategories(leftover), leftover);
    }

    /**
     * 커밋 하나를 기능에 매핑한다.
     * <ol>
     *   <li>연결된 담당자 로그인이 딱 하나의 기능과 맞으면 그 기능(확정).</li>
     *   <li>여러 기능에 걸치면 키워드로 좁히고, 실패하면 첫 기능에 추정으로 붙인다.</li>
     *   <li>담당자 매칭이 없으면 커밋 메시지 키워드로만 추정 매핑한다.</li>
     * </ol>
     * 어디에도 안 붙으면 null(→ 카테고리로).
     */
    private Hit attribute(CommitInfo c, List<Ctx> ctxs) {
        String author = c.author() == null ? null : c.author().toLowerCase(Locale.ROOT);
        List<Ctx> byAuthor = new ArrayList<>();
        if (author != null) {
            for (Ctx x : ctxs) {
                if (x.logins.contains(author)) byAuthor.add(x);
            }
        }
        if (byAuthor.size() == 1) {
            return new Hit(byAuthor.get(0), false);
        }
        if (byAuthor.size() > 1) {
            for (Ctx x : byAuthor) {
                if (keywordMatch(c, x)) return new Hit(x, false);
            }
            return new Hit(byAuthor.get(0), true); // 담당자는 알지만 어느 기능인지 불확실 → 추정
        }
        for (Ctx x : ctxs) {
            if (keywordMatch(c, x)) return new Hit(x, true);
        }
        return null;
    }

    private boolean keywordMatch(CommitInfo c, Ctx x) {
        if (x.tokens.isEmpty() || c.subject() == null) return false;
        String hay = c.subject().toLowerCase(Locale.ROOT);
        for (String tok : x.tokens) {
            if (hay.contains(tok)) return true;
        }
        return false;
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
     */
    private List<String> buildMatchTokens(Feature f, List<Task> tasks) {
        Set<String> tokens = new LinkedHashSet<>(tokenize(f.getTitle()));
        for (Task t : tasks) {
            tokens.addAll(tokenize(t.getTitle()));
        }
        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        if (!taskIds.isEmpty()) {
            for (ChecklistItem item : checklistItemRepository.findByTaskIdInWithAssignee(taskIds)) {
                tokens.addAll(tokenize(item.getTitle()));
                if (tokens.size() >= MAX_MATCH_TOKENS) {
                    break;
                }
            }
        }
        List<String> result = new ArrayList<>(tokens);
        return result.size() > MAX_MATCH_TOKENS ? result.subList(0, MAX_MATCH_TOKENS) : result;
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
