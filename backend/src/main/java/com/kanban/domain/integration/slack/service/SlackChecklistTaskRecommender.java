package com.kanban.domain.integration.slack.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.feature.service.InboxFeatureService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 슬랙 멘션 체크리스트 프롬프트에 "AI 추천 태스크" 버튼(최대 3개)을 뒤늦게 붙인다.
 *
 * <p>멘션 처리 스레드는 프롬프트를 먼저 올리고 바로 끝나며, 이 클래스가 별도 스레드에서
 * 보드의 열린 태스크를 AI에 보여 주고 항목이 들어가기 가장 알맞은 태스크 Top3를 고른 뒤
 * {@code chat.update}로 프롬프트 메시지를 갈아끼운다. AI 호출 실패·후보 없음·파싱 실패는
 * 모두 조용히 무시한다 — 추천은 부가 기능이라 프롬프트 자체는 이미 쓸 수 있는 상태다.
 *
 * <p>사용자 요청에 따라 AI 크레딧은 차감하지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlackChecklistTaskRecommender {

    /** 추천 버튼 action_id 접두어 — 한 블록 안에서 action_id가 겹치면 안 되므로 뒤에 순번을 붙인다 */
    public static final String ACTION_PICK_TASK_PREFIX = "bridge_cl_pick_task_";
    /** 추천 버튼 블록 block_id 접두어 (프롬프트 액션 블록과 겹치지 않게 별도 접두어) */
    public static final String RECO_BLOCK_ID_PREFIX = "bridge_cl_reco:";

    private static final int MAX_RECOMMENDATIONS = 3;
    /** AI에 보여 줄 후보 상한 — 최근 수정 순으로 자른다 (토큰 상한 방어) */
    private static final int MAX_CANDIDATES = 120;
    private static final int DESCRIPTION_SNIPPET_LENGTH = 80;
    private static final int BUTTON_TEXT_MAX_LENGTH = 75;
    private static final int MAX_TOKENS = 256;

    private final TaskRepository taskRepository;
    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final SlackApiClient slackApiClient;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.team:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.team:gpt-4o-mini}")
    private String openaiModel;

    /**
     * 프롬프트 메시지({@code channelId}/{@code ts})에 추천 버튼을 붙인다.
     *
     * @param baseBlocks 이미 게시된 프롬프트 블록 (첫 블록이 안내 섹션, 그 뒤가 액션 블록)
     * @param metadata   프롬프트 metadata — chat.update 시 그대로 다시 실어 인터랙션 복원을 보장한다
     */
    @Async
    @Transactional(readOnly = true)
    public void recommendAndAttach(String botToken, String channelId, String ts, String boardId, String title,
                                   List<Map<String, Object>> baseBlocks, Map<String, Object> metadata) {
        try {
            List<Task> picks = recommend(boardId, title);
            if (picks.isEmpty()) {
                return;
            }
            // AI 응답을 기다리는 사이 사용자가 이미 추가/취소를 눌렀으면 결과 메시지를 프롬프트로 되돌리지 않는다
            if (!isPromptStillOpen(botToken, channelId, ts)) {
                log.debug("Slack checklist prompt already resolved, skipping recommendations: board={}", boardId);
                return;
            }

            List<Map<String, Object>> buttons = new ArrayList<>();
            for (int i = 0; i < picks.size(); i++) {
                Task task = picks.get(i);
                buttons.add(Map.of("type", "button",
                        "action_id", ACTION_PICK_TASK_PREFIX + i,
                        "text", Map.of("type", "plain_text", "text",
                                truncate(task.getTitle(), BUTTON_TEXT_MAX_LENGTH)),
                        "value", task.getId()));
            }

            List<Map<String, Object>> blocks = new ArrayList<>(baseBlocks.size() + 2);
            blocks.add(baseBlocks.get(0));
            blocks.add(Map.of("type", "context",
                    "elements", List.of(Map.of("type", "mrkdwn", "text", ":sparkles: *AI 추천 태스크* — 눌러서 바로 추가"))));
            blocks.add(Map.of("type", "actions",
                    "block_id", RECO_BLOCK_ID_PREFIX + boardId,
                    "elements", buttons));
            blocks.addAll(baseBlocks.subList(1, baseBlocks.size()));

            slackApiClient.chatUpdate(botToken, channelId, ts, blocks, metadata);
            log.info("Attached {} AI task recommendations to Slack checklist prompt: board={}", picks.size(), boardId);
        } catch (Exception e) {
            log.warn("Failed to attach AI task recommendations to Slack prompt: board={} error={}", boardId, e.getMessage());
        }
    }

    /**
     * 보드의 열린 태스크(미분류·완료 제외) 중 항목이 들어가기 알맞은 순으로 최대 3개를 고른다.
     * AI에는 ID 대신 번호를 보여 주고 번호로 돌려받아 존재하지 않는 ID를 지어내는 것을 막는다.
     */
    List<Task> recommend(String boardId, String title) {
        List<Task> candidates = taskRepository.findByBoardIdWithFetch(boardId).stream()
                .filter(t -> !Boolean.TRUE.equals(t.getIsCompleted()))
                .filter(t -> t.getFeature() == null || !InboxFeatureService.INBOX_TITLE.equals(t.getFeature().getTitle()))
                .sorted((a, b) -> {
                    if (a.getUpdatedAt() == null || b.getUpdatedAt() == null) return 0;
                    return b.getUpdatedAt().compareTo(a.getUpdatedAt());
                })
                .limit(MAX_CANDIDATES)
                .toList();
        if (candidates.isEmpty()) {
            return List.of();
        }

        StringBuilder catalog = new StringBuilder();
        for (int i = 0; i < candidates.size(); i++) {
            Task t = candidates.get(i);
            catalog.append(i + 1).append(". ");
            if (t.getFeature() != null) {
                catalog.append('[').append(t.getFeature().getTitle()).append("] ");
            }
            catalog.append(t.getTitle());
            if (t.getBlock() != null) {
                catalog.append(" (").append(t.getBlock().getName()).append(')');
            }
            String desc = t.getDescription();
            if (desc != null && !desc.isBlank()) {
                catalog.append(" — ").append(truncate(desc.replaceAll("\\s+", " ").trim(), DESCRIPTION_SNIPPET_LENGTH));
            }
            catalog.append('\n');
        }

        String systemPrompt = """
                You match a new checklist item to the most suitable existing task on a kanban board.
                Each task is listed as "N. [feature] title (column) — description".
                Pick up to 3 tasks, best match first, whose scope the checklist item most plausibly belongs to
                (same feature, same subject, same component). Prefer precision over quantity: return fewer
                numbers when only one or two tasks are clearly relevant, and return an empty list when nothing fits.
                Respond with JSON only, no prose: {"picks":[N, N, N]}
                """;
        String userPrompt = "Checklist item:\n" + title + "\n\nTasks:\n" + catalog;

        String model = "openai".equals(provider) ? openaiModel : claudeModel;
        AIResponse response = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS, 0.0);

        Set<Integer> picked = parsePicks(response.content(), candidates.size());
        List<Task> result = new ArrayList<>();
        for (Integer index : picked) {
            if (result.size() >= MAX_RECOMMENDATIONS) break;
            result.add(candidates.get(index - 1));
        }
        return result;
    }

    /**
     * 프롬프트 메시지가 아직 액션 블록(셀렉트/버튼)을 갖고 있는지 확인한다.
     * 조회 자체가 실패하면(스코프 부족 등) 열려 있다고 보고 진행한다 — 경쟁 조건 자체가 드물다.
     */
    @SuppressWarnings("unchecked")
    private boolean isPromptStillOpen(String botToken, String channelId, String ts) {
        try {
            Map<String, Object> result = slackApiClient.conversationsReplies(botToken, channelId, ts, 1);
            if (!(result.get("messages") instanceof List<?> messages) || messages.isEmpty()) {
                return true;
            }
            for (Object messageObj : messages) {
                if (!(messageObj instanceof Map<?, ?> message) || !ts.equals(String.valueOf(message.get("ts")))) continue;
                if (!(message.get("blocks") instanceof List<?> blocks)) return false;
                for (Object blockObj : blocks) {
                    if (blockObj instanceof Map<?, ?> block && "actions".equals(block.get("type"))) {
                        return true;
                    }
                }
                return false;
            }
            return true;
        } catch (Exception e) {
            log.debug("Could not verify Slack prompt state before attaching recommendations: {}", e.getMessage());
            return true;
        }
    }

    /** {@code {"picks":[..]}} 또는 맨몸 배열을 받아 1..size 범위의 번호만 순서대로 남긴다. */
    private Set<Integer> parsePicks(String content, int size) {
        Set<Integer> picks = new LinkedHashSet<>();
        if (content == null) return picks;
        String json = content.trim();
        int start = json.indexOf('{');
        int arrayStart = json.indexOf('[');
        if (start < 0 || (arrayStart >= 0 && arrayStart < start)) {
            start = arrayStart;
        }
        if (start < 0) return picks;
        int end = Math.max(json.lastIndexOf('}'), json.lastIndexOf(']'));
        if (end < start) return picks;
        json = json.substring(start, end + 1);
        try {
            JsonNode node = objectMapper.readTree(json);
            JsonNode array = node.isArray() ? node : node.get("picks");
            if (array == null || !array.isArray()) return picks;
            for (JsonNode n : array) {
                if (!n.canConvertToInt()) continue;
                int value = n.asInt();
                if (value >= 1 && value <= size) {
                    picks.add(value);
                }
            }
        } catch (Exception e) {
            log.debug("Unparseable AI task recommendation response: {}", content);
        }
        return picks;
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return "";
        return text.length() > maxLength ? text.substring(0, maxLength - 1) + "…" : text;
    }
}
