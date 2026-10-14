package com.kanban.domain.comment.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.dto.CommentAIResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.ai.AiInvocationRequest;
import com.kanban.global.ai.AiInvocationTemplate;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommentAIService {

    private final AiInvocationTemplate aiInvocationTemplate;
    private final TransactionTemplate transactionTemplate;
    private final CommentRepository commentRepository;
    private final TaskRepository taskRepository;
    private final BoardService boardService;

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

    /**
     * 트랜잭션 밖에서 실행된다 — 댓글 읽기는 {@code transactionTemplate}으로 짧게 묶고, LLM 호출은
     * {@link AiInvocationTemplate}이 트랜잭션 없이 수행한다(크레딧 차감·사용량 로그는 각자 짧은 트랜잭션).
     */
    public CommentAIResponse.Summary summarizeComments(
            String boardId, String taskId, String userId, String language) {

        // 1. 입력 읽기 (tx) — Comment.author는 LAZY라 본문 텍스트까지 여기서 만든다
        PromptInput input = transactionTemplate.execute(status -> {
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
            return new PromptInput(comments.size(),
                    buildSystemPrompt(language),
                    buildUserPrompt(task.getTitle(), commentsText));
        });

        // 2. 크레딧 차감 → AI 호출 → 사용량 로그 → 파싱 (트랜잭션 없음)
        log.info("Generating AI comment summary for task: {} in board: {} ({} comments)",
                taskId, boardId, input.commentCount());
        AiInvocationRequest request = AiInvocationRequest.builder()
                .boardId(boardId).userId(userId)
                .featureType("COMMENT_SUMMARY").creditCost(1)
                .systemPrompt(input.systemPrompt()).userPrompt(input.userPrompt())
                .model(getModel()).maxTokens(MAX_TOKENS)
                .build();
        return aiInvocationTemplate.invoke(request, content -> parseAIResponse(content, taskId));
    }

    private record PromptInput(int commentCount, String systemPrompt, String userPrompt) {
    }

    private String buildSystemPrompt(String language) {
        String langName = language != null ? LANGUAGE_NAMES.getOrDefault(language, "English") : null;
        String langInstruction;
        String langReminder;
        if (langName != null) {
            langInstruction = "CRITICAL LANGUAGE RULE: You MUST write ALL output text (summary, decisions, open_questions, action_items) in " + langName + ". Do NOT use English for any content values.";
            langReminder = "REMINDER: All text content in the JSON output MUST be in " + langName + ".";
        } else {
            langInstruction = "CRITICAL LANGUAGE RULE: Match the language of the comments for all output text.";
            langReminder = "REMINDER: Match the output language to the comments' language.";
        }

        return String.format("""
                You are a discussion analyzer for the BRIDGE project management tool.
                You receive a thread of comments on a task and extract key information.

                %s

                <rules>
                - Identify concrete decisions that were made or agreed upon
                - Flag questions that remain unanswered or unresolved
                - Extract action items — specific things someone needs to do
                - For action items, include the person responsible if mentioned (assignee_hint)
                - Provide a 1-2 sentence overall summary of the discussion
                - Focus on text content only (ignore file attachments and reactions)
                - If no decisions/questions/actions exist for a category, return an empty array
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                </rules>

                <output_format>
                {
                  "summary": "(discussion summary in user language)",
                  "decisions": ["(decision in user language)"],
                  "open_questions": ["(unresolved question in user language)"],
                  "action_items": [
                    { "title": "(action item in user language)", "assignee_hint": "Person name or null" }
                  ]
                }
                </output_format>

                %s
                """, langInstruction, langReminder);
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
            JsonNode root = aiInvocationTemplate.readJsonTree(aiResponse);

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
