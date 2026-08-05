package com.kanban.domain.personal.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 백로그 항목을 어디에 붙일지 — 규칙만으로 후보 순위를 매긴다.
 *
 * <p>AI 앞단에 두는 이유가 두 가지다.
 * <ol>
 *   <li>후보 전체(보드 태스크 수백 개)를 LLM에 넣으면 토큰이 튀고 정확도는 오르지 않는다.
 *       여기서 상위 N개로 줄인 뒤 그 요약만 넘긴다.</li>
 *   <li>크레딧이 없거나 AI가 실패해도 추천 자리는 비면 안 된다. 그때 이 결과가 그대로 답이 된다.</li>
 * </ol>
 *
 * <p>부수효과가 없는 순수 계산이라 단위 테스트로 가중치를 고정한다.
 */
public final class PromoteCandidateScorer {

    private PromoteCandidateScorer() {
    }

    /** 제목 겹침 — 사람이 "이건 저 태스크 얘기"라고 알아보는 가장 큰 근거 */
    private static final double W_TITLE = 3.0;
    /** 대괄호 말머리 일치 — QA 티켓의 [네트워크] 같은 영역 표시 */
    private static final double W_TAG = 2.5;
    /** 내가 맡은 것 — 내 백로그는 대개 내 일 밑으로 들어간다 */
    private static final double W_MINE = 1.5;
    /** 방금 붙인 곳 — 백로그 정리는 몰아서 하는 일이다 */
    private static final double W_RECENT = 1.5;
    /** 보고 있는 마일스톤 */
    private static final double W_MILESTONE = 1.0;
    /** 아직 안 끝난 것 */
    private static final double W_OPEN = 1.0;
    /** 최근에 건드린 것 */
    private static final double W_FRESH = 0.5;

    /** "최근"의 기준 — 이 안에 수정됐으면 살아 있는 작업으로 본다 */
    private static final int FRESH_DAYS = 7;

    /** 토큰으로 인정하는 최소 길이. 한글 1글자·영문 1글자는 우연히 겹친다. */
    private static final int MIN_TOKEN = 2;

    /** 한글·영문·숫자가 아닌 것은 모두 구분자 */
    private static final Pattern SPLIT = Pattern.compile("[^\\p{IsHangul}\\p{IsAlphabetic}\\p{IsDigit}]+");
    /** 제목 맨 앞 [말머리] */
    private static final Pattern BRACKET = Pattern.compile("^\\s*[\\[(]([^\\])]{1,20})[\\])]");

    /** 어디에나 있어 변별력이 없는 말 — 겹쳐도 근거가 되지 않는다 */
    private static final Set<String> STOPWORDS = Set.of(
            "작업", "수정", "확인", "처리", "관련", "이슈", "버그", "개선", "적용", "추가", "변경",
            "기능", "문제", "테스트", "fix", "bug", "task", "issue", "todo", "wip", "the", "and", "for");

    /** 순위를 매길 대상 하나 (태스크 또는 피처) */
    public record Candidate(
            String id,
            String title,
            /** 한 줄 컨텍스트 — 태스크면 피처 제목, 피처면 null */
            String contextTitle,
            Set<String> assigneeIds,
            boolean completed,
            String milestoneId,
            LocalDateTime updatedAt) {
    }

    /** 점수를 매기는 기준 — 요청자와 그가 보고 있는 화면 */
    public record Context(
            String userId,
            /** 모달에서 고른 마일스톤. null이면 이 항목은 점수에 반영하지 않는다. */
            String selectedMilestoneId,
            /** 최근에 붙인 곳 (프런트가 localStorage에 들고 있는 것) */
            Set<String> recentIds,
            LocalDateTime now) {
    }

    /** 왜 추천됐는지 — 문구는 프런트가 언어에 맞게 그린다 */
    public enum ReasonCode {
        TITLE_MATCH, TAG_MATCH, MINE, RECENT, SAME_MILESTONE, RELATED
    }

    public record Scored(Candidate candidate, double score, ReasonCode reasonCode, List<String> matchedTokens) {
    }

    /**
     * 점수 순으로 자른다. 점수가 0이면(겹치는 근거가 하나도 없으면) 아예 빼는 게 아니라
     * 뒤로 밀기만 한다 — 후보가 적은 보드에서 추천이 통째로 비는 걸 막는다.
     */
    public static List<Scored> rank(String backlogTitle, List<Candidate> candidates, Context ctx, int limit) {
        List<String> backlogTokens = tokenize(backlogTitle);
        String backlogTag = bracketTag(backlogTitle);

        List<Scored> scored = new ArrayList<>(candidates.size());
        for (Candidate candidate : candidates) {
            scored.add(score(backlogTokens, backlogTag, candidate, ctx));
        }

        scored.sort(Comparator
                .comparingDouble(Scored::score).reversed()
                // 동점이면 미완료 → 최근 수정 순. 결과 순서가 실행마다 흔들리지 않게 id로 마무리한다.
                .thenComparing((Scored s) -> s.candidate().completed())
                .thenComparing(s -> s.candidate().updatedAt() == null
                        ? LocalDateTime.MIN : s.candidate().updatedAt(), Comparator.reverseOrder())
                .thenComparing(s -> s.candidate().id()));

        return scored.size() > limit ? new ArrayList<>(scored.subList(0, limit)) : scored;
    }

    private static Scored score(List<String> backlogTokens, String backlogTag, Candidate candidate, Context ctx) {
        String title = candidate.title() == null ? "" : candidate.title().toLowerCase(Locale.ROOT);
        Set<String> candidateTokens = new LinkedHashSet<>(tokenize(candidate.title()));
        if (candidate.contextTitle() != null) {
            candidateTokens.addAll(tokenize(candidate.contextTitle()));
        }

        List<String> matched = new ArrayList<>();
        for (String token : backlogTokens) {
            // 조사가 붙어 토큰이 어긋나는 경우("네트워크가")까지 잡으려고 부분 문자열도 본다
            if (candidateTokens.contains(token) || title.contains(token)) {
                matched.add(token);
            }
        }
        double titleScore = backlogTokens.isEmpty() ? 0 : (double) matched.size() / backlogTokens.size();

        String candidateTag = bracketTag(candidate.title());
        boolean tagMatch = backlogTag != null && backlogTag.equals(candidateTag);

        boolean mine = ctx.userId() != null
                && candidate.assigneeIds() != null
                && candidate.assigneeIds().contains(ctx.userId());
        boolean recent = ctx.recentIds() != null && ctx.recentIds().contains(candidate.id());
        boolean sameMilestone = ctx.selectedMilestoneId() != null
                && ctx.selectedMilestoneId().equals(candidate.milestoneId());
        boolean fresh = candidate.updatedAt() != null
                && ctx.now() != null
                && candidate.updatedAt().isAfter(ctx.now().minusDays(FRESH_DAYS));

        double total = W_TITLE * titleScore
                + (tagMatch ? W_TAG : 0)
                + (mine ? W_MINE : 0)
                + (recent ? W_RECENT : 0)
                + (sameMilestone ? W_MILESTONE : 0)
                + (candidate.completed() ? 0 : W_OPEN)
                + (fresh ? W_FRESH : 0);

        return new Scored(candidate, total, reasonOf(titleScore, tagMatch, mine, recent, sameMilestone), matched);
    }

    /**
     * 가장 강한 근거 하나만 고른다. 근거를 다 나열하면 읽지 않는다.
     * "완료 안 됨"·"최근 수정"은 점수엔 쓰지만 근거로는 내세우지 않는다 — 그건 이유가 아니라 조건이다.
     */
    private static ReasonCode reasonOf(double titleScore, boolean tagMatch, boolean mine,
                                       boolean recent, boolean sameMilestone) {
        if (titleScore >= 0.5) return ReasonCode.TITLE_MATCH;
        if (tagMatch) return ReasonCode.TAG_MATCH;
        if (titleScore > 0) return ReasonCode.TITLE_MATCH;
        if (recent) return ReasonCode.RECENT;
        if (mine) return ReasonCode.MINE;
        if (sameMilestone) return ReasonCode.SAME_MILESTONE;
        return ReasonCode.RELATED;
    }

    /** 소문자 토큰 목록 (중복 제거, 불용어·1글자 제외) */
    static List<String> tokenize(String text) {
        if (text == null || text.isBlank()) return List.of();
        Set<String> tokens = new LinkedHashSet<>();
        for (String raw : SPLIT.split(text.toLowerCase(Locale.ROOT))) {
            if (raw.length() < MIN_TOKEN) continue;
            if (STOPWORDS.contains(raw)) continue;
            tokens.add(raw);
        }
        return new ArrayList<>(tokens);
    }

    /** 제목 맨 앞 말머리 (없으면 null) */
    static String bracketTag(String title) {
        if (title == null) return null;
        Matcher matcher = BRACKET.matcher(title);
        if (!matcher.find()) return null;
        String tag = matcher.group(1).trim().toLowerCase(Locale.ROOT);
        return tag.isEmpty() ? null : tag;
    }
}
