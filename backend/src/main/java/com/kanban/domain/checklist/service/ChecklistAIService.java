package com.kanban.domain.checklist.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardPermissionService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistAIRequest;
import com.kanban.domain.checklist.dto.ChecklistAIResponse;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.ai.AiInvocationRequest;
import com.kanban.global.ai.AiInvocationTemplate;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChecklistAIService {

    private final AiInvocationTemplate aiInvocationTemplate;
    private final TransactionTemplate transactionTemplate;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;

    private final BoardPermissionService boardPermissionService;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiModel;

    private static final int MAX_TOKENS = 2048;

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
            Map.entry("pt-BR", "Portuguese (Brazil)"));

    /**
     * 트랜잭션 밖에서 실행된다 — 입력 읽기는 {@code transactionTemplate}으로 짧게 묶고, LLM 호출은
     * {@link AiInvocationTemplate}이 트랜잭션 없이 수행한다(크레딧 차감·사용량 로그는 각자 짧은 트랜잭션).
     */
    public ChecklistAIResponse.ChecklistDecomposition generateChecklistSuggestions(
            String boardId, String taskId, String userId, String language) {

        // 1. 입력 읽기 (tx) — 프롬프트에 들어갈 값은 여기서 전부 문자열로 뽑아둔다 (Task.feature는 LAZY)
        PromptInput input = transactionTemplate.execute(status -> {
            boardPermissionService.checkMemberOrAbove(boardId, userId);

            Task task =
                    taskRepository.findById(taskId).orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

            if (!task.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
            }

            Feature feature = task.getFeature();
            String taskTitle = task.getTitle();
            String taskDescription = task.getDescription();

            if ((taskTitle == null || taskTitle.isBlank())) {
                throw new BusinessException(ErrorCode.AI_CHECKLIST_CONTENT_EMPTY);
            }

            List<ChecklistItem> existingItems = checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId);
            String existingContext = buildExistingChecklistContext(existingItems);

            return new PromptInput(
                    taskTitle,
                    buildSystemPrompt(language),
                    buildUserPrompt(
                            feature.getTitle(), feature.getDescription(), taskTitle, taskDescription, existingContext));
        });

        // 2. 크레딧 차감 → AI 호출 → 사용량 로그 → 파싱 (트랜잭션 없음)
        log.info("Generating AI checklist suggestions for task: {} in board: {}", taskId, boardId);
        AiInvocationRequest request = AiInvocationRequest.builder()
                .boardId(boardId)
                .userId(userId)
                .featureType("CHECKLIST_DECOMPOSE")
                .creditCost(1)
                .systemPrompt(input.systemPrompt())
                .userPrompt(input.userPrompt())
                .model(getModel())
                .maxTokens(MAX_TOKENS)
                .build();
        return aiInvocationTemplate.invoke(request, content -> parseAIResponse(content, taskId, input.taskTitle()));
    }

    private record PromptInput(String taskTitle, String systemPrompt, String userPrompt) {}

    @Transactional
    public ChecklistAIResponse.ApplyResult applyChecklistSuggestions(
            String boardId, String taskId, String userId, ChecklistAIRequest.ApplyChecklist request) {

        boardPermissionService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository
                .findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Task task = taskRepository.findById(taskId).orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        User creator =
                userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int itemsCreated = 0;

        for (ChecklistAIRequest.ItemSuggestionApply item : request.getItems()) {
            Integer maxPos = checklistItemRepository.findMaxPositionByTaskId(taskId);
            int newPos = (maxPos != null) ? maxPos + 1 : 0;

            ChecklistItem checklistItem = ChecklistItem.builder()
                    .task(task)
                    .title(item.getTitle())
                    .position(newPos)
                    .build();
            checklistItemRepository.save(checklistItem);
            // 스프린트 편입은 부모 태스크가 들고 있어 별도 처리가 필요 없다.
            itemsCreated++;
        }

        log.info("AI checklist decomposition applied for task: {}. Items: {}", taskId, itemsCreated);

        activityService.logActivity(
                board,
                creator,
                ActivityAction.CHECKLIST_CREATED,
                TargetType.TASK,
                taskId,
                Map.of("taskTitle", task.getTitle(), "itemsCreated", String.valueOf(itemsCreated)));

        webSocketEventService.sendBoardEvent(
                boardId, BoardEventType.CHECKLIST_CREATED, userId, creator.getName(), Map.of("taskId", taskId));

        return ChecklistAIResponse.ApplyResult.builder()
                .itemsCreated(itemsCreated)
                .build();
    }

    private String buildSystemPrompt(String language) {
        String langName = language != null ? LANGUAGE_NAMES.getOrDefault(language, "English") : null;
        String langInstruction;
        String langReminder;
        if (langName != null) {
            langInstruction = "CRITICAL LANGUAGE RULE: You MUST write ALL output text (checklist item titles) in "
                    + langName + ". Do NOT use English for any content values.";
            langReminder = "REMINDER: All text content in the JSON output MUST be in " + langName + ".";
        } else {
            langInstruction =
                    "CRITICAL LANGUAGE RULE: Match the language of the task title and description for all output text.";
            langReminder = "REMINDER: Match the output language to the task's language.";
        }

        return String.format("""
                You are a project management assistant for the BRIDGE kanban tool.
                You receive a feature context (title, description) and a task (title, description), and you generate checklist items for that task.

                %s

                <rules>
                - Each checklist item should be a specific, actionable step to complete the task
                - Order items by logical execution sequence
                - Generate 3-10 checklist items per task
                - Keep checklist item titles concise (under 100 characters)
                - Items should be concrete and verifiable (can be checked off when done)
                - Do NOT duplicate items that already exist (see existing checklist below)
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                </rules>

                <output_format>
                {
                  "items": [
                    { "title": "(checklist step in user language)" }
                  ]
                }
                </output_format>

                %s
                """, langInstruction, langReminder);
    }

    private String buildUserPrompt(
            String featureTitle,
            String featureDescription,
            String taskTitle,
            String taskDescription,
            String existingContext) {
        String featDesc =
                featureDescription != null && !featureDescription.isBlank() ? featureDescription : "(no description)";
        if (featDesc.length() > 2000) {
            featDesc = featDesc.substring(0, 2000) + "...";
        }

        String taskDesc = taskDescription != null && !taskDescription.isBlank() ? taskDescription : "(no description)";
        if (taskDesc.length() > 2000) {
            taskDesc = taskDesc.substring(0, 2000) + "...";
        }

        return String.format("""
                Feature Title: %s
                Feature Description: %s

                Task Title: %s
                Task Description: %s

                Existing Checklist Items (do NOT duplicate these):
                %s

                Generate actionable checklist items for this task.
                """, featureTitle, featDesc, taskTitle, taskDesc, existingContext);
    }

    private String buildExistingChecklistContext(List<ChecklistItem> existingItems) {
        if (existingItems.isEmpty()) {
            return "(none)";
        }
        StringBuilder sb = new StringBuilder();
        for (ChecklistItem item : existingItems) {
            sb.append("- ").append(item.getTitle()).append("\n");
        }
        return sb.toString();
    }

    private ChecklistAIResponse.ChecklistDecomposition parseAIResponse(
            String aiResponse, String taskId, String taskTitle) {
        try {
            JsonNode root = aiInvocationTemplate.readJsonTree(aiResponse);

            List<ChecklistAIResponse.ItemSuggestion> items = new ArrayList<>();
            JsonNode itemsNode = root.get("items");

            if (itemsNode != null && itemsNode.isArray()) {
                for (JsonNode itemNode : itemsNode) {
                    String title = getTextOrNull(itemNode, "title");
                    if (title != null && !title.isBlank()) {
                        items.add(ChecklistAIResponse.ItemSuggestion.builder()
                                .title(title)
                                .build());
                    }
                }
            }

            return ChecklistAIResponse.ChecklistDecomposition.builder()
                    .taskId(taskId)
                    .taskTitle(taskTitle)
                    .items(items)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse AI response for task: {}", taskId, e);
            throw new BusinessException(ErrorCode.AI_CHECKLIST_DECOMPOSE_FAILED);
        }
    }

    private String getTextOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        return value.asText();
    }
}
