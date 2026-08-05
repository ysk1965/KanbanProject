package com.kanban.domain.personal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.feature.service.FeatureService;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.personal.PersonalTask;
import com.kanban.domain.personal.PersonalTaskPromotionType;
import com.kanban.domain.personal.PersonalTaskRepository;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * "이 백로그 항목, 어디에 붙일까" — 붙일 곳 후보 추천.
 *
 * <p>흐름은 규칙 → AI → 폴백 세 단계다.
 * <ol>
 *   <li>{@link PromoteCandidateScorer}로 보드 전체 후보에 점수를 매겨 상위 몇 개만 남긴다.</li>
 *   <li>useAi면 그 요약만 LLM에 넘겨 3개를 고르게 하고 이유를 받는다(크레딧 1).</li>
 *   <li>크레딧이 없거나 AI가 실패하면 1단계 결과를 그대로 돌려준다 — 추천 자리는 비지 않는다.</li>
 * </ol>
 *
 * <p>같은 (항목·대상·마일스톤) 조합의 AI 결과는 캐시에 남겨, 모달을 닫았다 다시 열어도
 * 크레딧이 다시 빠지지 않게 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PromoteSuggestionService {

    /** LLM에 넘길 후보 수 — 더 넣어도 정확도는 안 오르고 토큰만 는다 */
    private static final int PRESCORE_LIMIT = 25;
    /** 사용자에게 보여줄 추천 수. 4개부터는 "고르는 일"이 또 생긴다. */
    private static final int SUGGEST_LIMIT = 3;
    private static final int MAX_TOKENS = 512;
    private static final int MAX_TITLE_CHARS = 120;
    private static final String FEATURE_TYPE = "PROMOTE_SUGGEST";
    private static final String CACHE_NAME = "promoteSuggestions";

    private static final Map<String, String> LANGUAGE_NAMES = Map.ofEntries(
            Map.entry("ko", "Korean"),
            Map.entry("en", "English"),
            Map.entry("ja", "Japanese"),
            Map.entry("zh", "Chinese (Simplified)"),
            Map.entry("zh-TW", "Chinese (Traditional)"),
            Map.entry("vi", "Vietnamese"),
            Map.entry("th", "Thai"),
            Map.entry("hi", "Hindi"),
            Map.entry("es", "Spanish"),
            Map.entry("pt-BR", "Portuguese (Brazil)")
    );

    private final PersonalTaskRepository personalTaskRepository;
    private final BoardService boardService;
    private final TaskService taskService;
    private final FeatureService featureService;
    private final AiCreditService aiCreditService;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final CacheManager cacheManager;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiModel;

    @Transactional
    public PersonalTaskResponse.PromoteSuggestions suggest(
            String userId, String backlogId, PersonalTaskRequest.Suggest request) {

        PersonalTask backlog = personalTaskRepository.findById(backlogId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_TASK_NOT_FOUND));
        if (!backlog.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        if (backlog.getBoardId() == null) {
            // 마이스페이스 전역 항목은 붙일 보드가 없다
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (request.getTarget() == PersonalTaskPromotionType.TIMEBLOCK) {
            // 타임블록은 "어디에"가 아니라 "언제"라서 추천할 대상이 없다
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        String boardId = backlog.getBoardId();
        boardService.checkMemberOrAbove(boardId, userId);

        boolean featureMode = request.getTarget() == PersonalTaskPromotionType.TASK;
        Map<String, String> titles = new LinkedHashMap<>();
        List<PromoteCandidateScorer.Candidate> candidates = featureMode
                ? featureCandidates(boardId, request, titles)
                : taskCandidates(boardId, request, titles);

        if (candidates.isEmpty()) {
            return PersonalTaskResponse.PromoteSuggestions.builder()
                    .source("RULE").creditsUsed(0).creditsExhausted(false)
                    .suggestions(List.of())
                    .build();
        }

        Set<String> recentIds = request.getRecentRefIds() == null
                ? Set.of() : new LinkedHashSet<>(request.getRecentRefIds());
        PromoteCandidateScorer.Context context = new PromoteCandidateScorer.Context(
                userId,
                normalizeMilestoneId(request.getMilestoneId()),
                recentIds,
                LocalDateTime.now(ZoneOffset.UTC));

        List<PromoteCandidateScorer.Scored> prescored =
                PromoteCandidateScorer.rank(backlog.getTitle(), candidates, context, PRESCORE_LIMIT);

        String refType = featureMode ? "FEATURE" : "TASK";
        if (!request.isUseAi()) {
            return ruleResult(prescored, refType, 0, false);
        }

        // ─── AI 경로 ───
        String cacheKey = cacheKey(userId, backlogId, request);
        String cached = readCache(cacheKey);
        if (cached != null) {
            List<PersonalTaskResponse.PromoteSuggestion> parsed = parseAiJson(cached, titles, refType);
            // 캐시가 가리키던 태스크가 그새 지워졌을 수 있다 — 하나도 안 남으면 규칙으로 되돌린다
            if (!parsed.isEmpty()) {
                return PersonalTaskResponse.PromoteSuggestions.builder()
                        .source("AI").creditsUsed(0).creditsExhausted(false)
                        .suggestions(parsed)
                        .build();
            }
        }

        try {
            aiCreditService.consumeCredit(boardId, userId, FEATURE_TYPE, 1);
        } catch (BusinessException e) {
            if (e.getErrorCode() == ErrorCode.AI_CREDITS_EXHAUSTED
                    || e.getErrorCode() == ErrorCode.PERSONAL_AI_CREDITS_EXHAUSTED) {
                // 크레딧이 없다고 승격을 막지는 않는다 — 규칙 추천으로 내려준다
                return ruleResult(prescored, refType, 0, true);
            }
            throw e;
        }

        try {
            String json = callAi(boardId, userId, backlog.getTitle(), prescored, featureMode, request.getLanguage());
            List<PersonalTaskResponse.PromoteSuggestion> picked = parseAiJson(json, titles, refType);
            if (picked.isEmpty()) throw new IllegalStateException("AI가 고른 후보가 하나도 유효하지 않다");
            writeCache(cacheKey, json);
            return PersonalTaskResponse.PromoteSuggestions.builder()
                    .source("AI").creditsUsed(1).creditsExhausted(false)
                    .suggestions(picked)
                    .build();
        } catch (Exception e) {
            log.warn("Promote suggestion AI failed - board: {}, backlog: {}, error: {}",
                    boardId, backlogId, e.getMessage());
            // 쓰지 못한 크레딧은 돌려준다. 결과는 규칙 추천으로 대신한다.
            aiCreditService.refundCredit(boardId, userId, FEATURE_TYPE, 1);
            return ruleResult(prescored, refType, 0, false);
        }
    }

    // ─── 후보 모으기 ───

    private List<PromoteCandidateScorer.Candidate> taskCandidates(
            String boardId, PersonalTaskRequest.Suggest request, Map<String, String> titles) {

        List<TaskResponse.Simple> tasks =
                taskService.getTasksInternal(boardId, null, null, request.getMilestoneId()).getTasks();

        List<PromoteCandidateScorer.Candidate> candidates = new ArrayList<>();
        for (TaskResponse.Simple task : tasks) {
            if (task.isCompleted() && !request.isIncludeDone()) continue;
            titles.put(task.getId(), task.getTitle());
            Set<String> assigneeIds = task.getAssignees() == null ? Set.of()
                    : task.getAssignees().stream()
                    .map(TaskResponse.AssigneeInfo::getId)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            candidates.add(new PromoteCandidateScorer.Candidate(
                    task.getId(),
                    task.getTitle(),
                    task.getFeatureTitle(),
                    assigneeIds,
                    task.isCompleted(),
                    task.getMilestoneId(),
                    null));
        }
        return candidates;
    }

    private List<PromoteCandidateScorer.Candidate> featureCandidates(
            String boardId, PersonalTaskRequest.Suggest request, Map<String, String> titles) {

        List<FeatureResponse.Simple> features =
                featureService.getFeaturesInternal(boardId, request.getMilestoneId()).getFeatures();

        List<PromoteCandidateScorer.Candidate> candidates = new ArrayList<>();
        for (FeatureResponse.Simple feature : features) {
            boolean completed = feature.getStatus() != null && "COMPLETED".equals(feature.getStatus().name());
            if (completed && !request.isIncludeDone()) continue;
            titles.put(feature.getId(), feature.getTitle());
            Set<String> assigneeIds = feature.getAssignee() == null
                    ? Set.of() : Set.of(feature.getAssignee().getId());
            candidates.add(new PromoteCandidateScorer.Candidate(
                    feature.getId(),
                    feature.getTitle(),
                    null,
                    assigneeIds,
                    completed,
                    // 피처는 이미 마일스톤으로 걸러 온 목록이라 여기서 가점을 또 주지 않는다
                    null,
                    null));
        }
        return candidates;
    }

    // ─── 결과 만들기 ───

    private PersonalTaskResponse.PromoteSuggestions ruleResult(
            List<PromoteCandidateScorer.Scored> prescored, String refType,
            int creditsUsed, boolean creditsExhausted) {

        List<PersonalTaskResponse.PromoteSuggestion> suggestions = prescored.stream()
                .limit(SUGGEST_LIMIT)
                .map(scored -> PersonalTaskResponse.PromoteSuggestion.builder()
                        .refId(scored.candidate().id())
                        .refType(refType)
                        .score(round2(scored.score()))
                        .reasonCode(scored.reasonCode().name())
                        .reasonTokens(scored.matchedTokens())
                        .build())
                .toList();

        return PersonalTaskResponse.PromoteSuggestions.builder()
                .source("RULE")
                .creditsUsed(creditsUsed)
                .creditsExhausted(creditsExhausted)
                .suggestions(suggestions)
                .build();
    }

    /** AI 응답 → 응답 DTO. 지금 후보 목록에 없는 id는 버린다(그새 지워졌거나 AI가 지어낸 id). */
    private List<PersonalTaskResponse.PromoteSuggestion> parseAiJson(
            String json, Map<String, String> titles, String refType) {

        List<PersonalTaskResponse.PromoteSuggestion> result = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode items = root.get("suggestions");
            if (items == null || !items.isArray()) return result;

            Set<String> seen = new LinkedHashSet<>();
            for (JsonNode item : items) {
                String refId = text(item, "ref_id");
                if (refId == null || !titles.containsKey(refId) || !seen.add(refId)) continue;
                result.add(PersonalTaskResponse.PromoteSuggestion.builder()
                        .refId(refId)
                        .refType(refType)
                        .score(0)
                        .reason(truncate(text(item, "reason"), 60))
                        .build());
                if (result.size() >= SUGGEST_LIMIT) break;
            }
        } catch (Exception e) {
            log.warn("Failed to parse promote suggestion AI response: {}", e.getMessage());
        }
        return result;
    }

    // ─── AI 호출 ───

    private String callAi(String boardId, String userId, String backlogTitle,
                          List<PromoteCandidateScorer.Scored> prescored, boolean featureMode, String language) {

        String model = "openai".equals(provider) ? openaiModel : claudeModel;
        AIResponse aiResult = aiProvider.chatWithUsage(
                buildSystemPrompt(featureMode, language),
                buildUserPrompt(backlogTitle, prescored, featureMode),
                model, MAX_TOKENS, 0.0);

        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType(FEATURE_TYPE).provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .creditsUsed(1)
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }

        return extractJson(aiResult.content());
    }

    private String buildSystemPrompt(boolean featureMode, String language) {
        String langName = language != null ? LANGUAGE_NAMES.getOrDefault(language, "English") : "Korean";
        String kind = featureMode ? "feature" : "task";

        return String.format("""
                You are a project management assistant for the BRIDGE kanban tool.
                A user wrote a quick backlog note and now wants to attach it to an existing %s.
                You receive the note and a pre-filtered candidate list, and you pick the best places to attach it.

                CRITICAL LANGUAGE RULE: Write every "reason" in %s.

                <rules>
                - Pick at most 3 candidates, best first
                - Use ONLY ids from the candidate list. Never invent an id.
                - If fewer than 3 candidates genuinely fit, return fewer. Do not pad the list.
                - "reason" states WHY this candidate fits, in under 30 characters, as a phrase (no full sentence, no trailing period)
                - Base the reason on what is visible: overlapping words, the same bracketed area tag, the same owner
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                </rules>

                <output_format>
                {
                  "suggestions": [
                    { "ref_id": "(id from the candidate list)", "reason": "(short why, in %s)" }
                  ]
                }
                </output_format>
                """, kind, langName, langName);
    }

    private String buildUserPrompt(String backlogTitle, List<PromoteCandidateScorer.Scored> prescored,
                                   boolean featureMode) {
        StringBuilder sb = new StringBuilder();
        sb.append("Backlog note: ").append(truncate(backlogTitle, MAX_TITLE_CHARS)).append("\n\n");
        sb.append(featureMode ? "Candidate features:\n" : "Candidate tasks:\n");
        for (PromoteCandidateScorer.Scored scored : prescored) {
            PromoteCandidateScorer.Candidate candidate = scored.candidate();
            sb.append("- id=").append(candidate.id())
                    .append(" | title=").append(truncate(candidate.title(), MAX_TITLE_CHARS));
            if (candidate.contextTitle() != null && !candidate.contextTitle().isBlank()) {
                sb.append(" | feature=").append(truncate(candidate.contextTitle(), 40));
            }
            if (candidate.completed()) {
                sb.append(" | done");
            }
            sb.append("\n");
        }
        sb.append("\nPick the best places to attach the backlog note.");
        return sb.toString();
    }

    // ─── 캐시 ───

    /**
     * 같은 조합이면 같은 키. useAi는 키에 넣지 않는다 — 규칙 경로는 캐시를 쓰지 않기 때문이다.
     * includeDone은 후보 풀을 바꾸므로 키에 들어간다.
     */
    private String cacheKey(String userId, String backlogId, PersonalTaskRequest.Suggest request) {
        return String.join(":", userId, backlogId, request.getTarget().name(),
                request.getMilestoneId() == null ? "all" : request.getMilestoneId(),
                request.isIncludeDone() ? "done" : "open");
    }

    private String readCache(String key) {
        Cache cache = cacheManager.getCache(CACHE_NAME);
        if (cache == null) return null;
        try {
            return cache.get(key, String.class);
        } catch (Exception e) {
            log.debug("Promote suggestion cache read failed: {}", e.getMessage());
            return null;
        }
    }

    private void writeCache(String key, String json) {
        Cache cache = cacheManager.getCache(CACHE_NAME);
        if (cache == null) return;
        try {
            cache.put(key, json);
        } catch (Exception e) {
            log.debug("Promote suggestion cache write failed: {}", e.getMessage());
        }
    }

    // ─── 잡동사니 ───

    /** "none"(마일스톤 미배정)은 같은 마일스톤 가점의 대상이 아니다 */
    private String normalizeMilestoneId(String milestoneId) {
        if (milestoneId == null || milestoneId.isBlank() || "none".equals(milestoneId)) return null;
        return milestoneId;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        String result = value.asText().trim();
        return result.isEmpty() ? null : result;
    }

    private String truncate(String text, int max) {
        if (text == null) return null;
        return text.length() <= max ? text : text.substring(0, max) + "...";
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /** 모델이 코드펜스를 붙여 오는 경우가 있어 JSON 본문만 도려낸다 */
    private String extractJson(String response) {
        if (response == null) return "{}";
        String trimmed = response.trim();
        if (trimmed.startsWith("```")) {
            int firstNewline = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                trimmed = trimmed.substring(firstNewline + 1, lastFence).trim();
            }
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        return (start >= 0 && end > start) ? trimmed.substring(start, end + 1) : trimmed;
    }
}
