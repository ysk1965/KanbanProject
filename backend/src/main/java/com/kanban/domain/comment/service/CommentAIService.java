package com.kanban.domain.comment.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.dto.CommentAIResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommentAIService {

    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final CommentRepository commentRepository;
    private final TaskRepository taskRepository;
    private final BoardService boardService;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiModel;

    private static final int MAX_TOKENS = 2048;
    private static final int MIN_COMMENTS = 3;
    private static final int MAX_COMMENTS = 50;

    private String getModel() {
        return "openai".equals(provider) ? openaiModel : claudeModel;
    }

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

    @Transactional
    public CommentAIResponse.Summary summarizeComments(
            String boardId, String taskId, String userId, String language) {

        aiCreditService.consumeCredit(boardId, userId, "COMMENT_SUMMARY", 1);
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        List<Comment> comments = commentRepository.findByTaskIdWithAuthor(taskId);
        if (comments.size() < MIN_COMMENTS) {
            throw new BusinessException(ErrorCode.AI_COMMENT_INSUFFICIENT);
        }

        // Limit to most recent comments
        if (comments.size() > MAX_COMMENTS) {
            comments = comments.subList(comments.size() - MAX_COMMENTS, comments.size());
        }

        String commentsText = buildCommentsText(comments);
        String systemPrompt = buildSystemPrompt(language);
        String userPrompt = buildUserPrompt(task.getTitle(), commentsText);

        log.info("Generating AI comment summary for task: {} in board: {} ({} comments)",
                taskId, boardId, comments.size());
        String model = getModel();
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS);

        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType("COMMENT_SUMMARY").provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }

        return parseAIResponse(aiResult.content(), taskId);
    }

    private String buildSystemPrompt(String language) {
        String langName = language != null ? LANGUAGE_NAMES.getOrDefault(language, "English") : null;
        String langInstruction = langName != null
                ? "- IMPORTANT: Write ALL output text in " + langName + "."
                : "- Match the language of the comments.";

        return String.format("""
                You are a discussion analyzer for the BRIDGE project management tool.
                You receive a thread of comments on a task and extract key information.

                <rules>
                - Identify concrete decisions that were made or agreed upon
                - Flag questions that remain unanswered or unresolved
                - Extract action items — specific things someone needs to do
                - For action items, include the person responsible if mentioned (assignee_hint)
                - Provide a 1-2 sentence overall summary of the discussion
                - Focus on text content only (ignore file attachments and reactions)
                - If no decisions/questions/actions exist for a category, return an empty array
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                %s
                </rules>

                <output_format>
                {
                  "summary": "Overall discussion summary in 1-2 sentences",
                  "decisions": ["Decision or agreement 1", "Decision 2"],
                  "open_questions": ["Unresolved question 1"],
                  "action_items": [
                    { "title": "What needs to be done", "assignee_hint": "Person name or null" }
                  ]
                }
                </output_format>
                """, langInstruction);
    }

    private String buildUserPrompt(String taskTitle, String commentsText) {
        return String.format("""
                Task: %s

                Comment Thread:
                %s

                Analyze this comment thread and extract decisions, open questions, and action items.
                """, taskTitle, commentsText);
    }

    private String buildCommentsText(List<Comment> comments) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        StringBuilder sb = new StringBuilder();
        int totalLength = 0;

        for (Comment c : comments) {
            String authorName = c.getAuthor() != null ? c.getAuthor().getName() : "Unknown";
            String time = c.getCreatedAt() != null ? c.getCreatedAt().format(formatter) : "";
            String content = c.getContent() != null ? c.getContent() : "";

            String line = String.format("[%s] %s: %s\n", time, authorName, content);

            if (totalLength + line.length() > 5000) {
                sb.append("... (earlier comments truncated)\n");
                break;
            }

            sb.append(line);
            totalLength += line.length();
        }

        return sb.toString();
    }

    private CommentAIResponse.Summary parseAIResponse(String aiResponse, String taskId) {
        try {
            String json = extractJson(aiResponse);
            JsonNode root = objectMapper.readTree(json);

            String summary = getTextOrNull(root, "summary");
            List<String> decisions = parseStringArray(root, "decisions");
            List<String> openQuestions = parseStringArray(root, "open_questions");

            List<CommentAIResponse.ActionItem> actionItems = new ArrayList<>();
            JsonNode actionItemsNode = root.get("action_items");
            if (actionItemsNode != null && actionItemsNode.isArray()) {
                for (JsonNode itemNode : actionItemsNode) {
                    actionItems.add(CommentAIResponse.ActionItem.builder()
                            .title(getTextOrNull(itemNode, "title"))
                            .assigneeHint(getTextOrNull(itemNode, "assignee_hint"))
                            .build());
                }
            }

            return CommentAIResponse.Summary.builder()
                    .taskId(taskId)
                    .summary(summary)
                    .decisions(decisions)
                    .openQuestions(openQuestions)
                    .actionItems(actionItems)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse AI response for task comments: {}", taskId, e);
            throw new BusinessException(ErrorCode.AI_COMMENT_SUMMARY_FAILED);
        }
    }

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
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }

        return trimmed;
    }

    private List<String> parseStringArray(JsonNode node, String field) {
        List<String> result = new ArrayList<>();
        JsonNode arrayNode = node.get(field);
        if (arrayNode != null && arrayNode.isArray()) {
            for (JsonNode item : arrayNode) {
                if (item.isTextual()) result.add(item.asText());
            }
        }
        return result;
    }

    private String getTextOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        return value.asText();
    }
}
