package com.kanban.domain.feature.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.dto.FeatureAIRequest;
import com.kanban.domain.feature.dto.FeatureAIResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FeatureAIService {

    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BlockRepository blockRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final ActivityService activityService;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;
    private final WebSocketEventService webSocketEventService;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiModel;

    private static final int MAX_TOKENS = 4096;

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
    public FeatureAIResponse.TaskDecomposition generateTaskSuggestions(
            String boardId, String featureId, String userId, String language) {

        aiCreditService.consumeCredit(boardId, userId, "FEATURE_DECOMPOSE", 1);
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        String title = feature.getTitle();
        String description = feature.getDescription();
        if ((title == null || title.isBlank()) && (description == null || description.isBlank())) {
            throw new BusinessException(ErrorCode.AI_FEATURE_CONTENT_EMPTY);
        }

        List<Task> existingTasks = taskRepository.findByFeatureIdOrderByPositionAsc(featureId);
        String existingTasksContext = buildExistingTasksContext(existingTasks);

        String systemPrompt = buildSystemPrompt(language);
        String userPrompt = buildUserPrompt(title, description, existingTasksContext);

        log.info("Generating AI task decomposition for feature: {} in board: {}", featureId, boardId);
        String model = getModel();
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS);

        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType("FEATURE_DECOMPOSE").provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }

        return parseAIResponse(aiResult.content(), featureId, title);
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public FeatureAIResponse.ApplyResult applyTaskSuggestions(
            String boardId, String featureId, String userId, FeatureAIRequest.ApplyDecomposition request) {

        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        int tasksCreated = 0;
        int checklistsCreated = 0;

        for (FeatureAIRequest.TaskSuggestionApply ts : request.getTasks()) {
            validateTaskLimit(board);

            Integer maxTaskPos = taskRepository.findMaxPositionByBlockId(taskBlock.getId());
            int newTaskPos = (maxTaskPos != null) ? maxTaskPos + 1 : 0;

            Integer maxFeaturePos = taskRepository.findMaxFeaturePositionByFeatureId(featureId);
            int newFeaturePos = (maxFeaturePos != null) ? maxFeaturePos + 1 : 0;

            Task task = Task.builder()
                    .feature(feature)
                    .board(board)
                    .block(taskBlock)
                    .title(ts.getTitle())
                    .description(ts.getDescription())
                    .position(newTaskPos)
                    .featurePosition(newFeaturePos)
                    .createdBy(creator)
                    .build();
            taskRepository.save(task);
            feature.incrementTotalTasks();
            tasksCreated++;

            activityService.logActivity(board, creator,
                    ActivityAction.TASK_CREATED, TargetType.TASK, task.getId(),
                    Map.of("taskTitle", task.getTitle(),
                            "featureTitle", feature.getTitle(),
                            "featureColor", feature.getColor() != null ? feature.getColor() : "#6366F1"));

            if (ts.getChecklists() != null) {
                for (FeatureAIRequest.ChecklistSuggestionApply cs : ts.getChecklists()) {
                    Integer maxClPos = checklistItemRepository.findMaxPositionByTaskId(task.getId());
                    int newClPos = (maxClPos != null) ? maxClPos + 1 : 0;

                    ChecklistItem item = ChecklistItem.builder()
                            .task(task)
                            .title(cs.getTitle())
                            .position(newClPos)
                            .build();
                    checklistItemRepository.save(item);
                    checklistsCreated++;
                }
            }
        }

        log.info("AI task decomposition applied for feature: {}. Tasks: {}, Checklists: {}",
                featureId, tasksCreated, checklistsCreated);

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_UPDATED,
                userId, creator.getName(), Map.of("featureId", featureId));

        return FeatureAIResponse.ApplyResult.builder()
                .tasksCreated(tasksCreated)
                .checklistsCreated(checklistsCreated)
                .build();
    }

    private String buildSystemPrompt(String language) {
        String langName = language != null ? LANGUAGE_NAMES.getOrDefault(language, "English") : null;
        String langInstruction;
        String langReminder;
        if (langName != null) {
            langInstruction = "CRITICAL LANGUAGE RULE: You MUST write ALL output text (task titles, descriptions, checklist titles) in " + langName + ". Do NOT use English for any content values.";
            langReminder = "REMINDER: All text content in the JSON output MUST be in " + langName + ".";
        } else {
            langInstruction = "CRITICAL LANGUAGE RULE: Match the language of the feature title and description for all output text.";
            langReminder = "REMINDER: Match the output language to the feature's language.";
        }

        return String.format("""
                You are a project management assistant for the BRIDGE kanban tool.
                You receive a feature title and description, and you decompose it into actionable tasks with optional checklists.

                %s

                <rules>
                - Each task should be a concrete, actionable work item
                - Order tasks by logical execution sequence (dependencies first)
                - Generate 3-8 tasks per feature (not too few, not too many)
                - Each task can have 0-5 checklist items for detailed sub-steps
                - Keep task titles concise (under 100 characters)
                - Descriptions should provide implementation context
                - Do NOT duplicate tasks that already exist (see existing tasks below)
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                </rules>

                <output_format>
                {
                  "tasks": [
                    {
                      "title": "(task title in user language)",
                      "description": "(description in user language)",
                      "checklists": [
                        { "title": "(checklist step in user language)" }
                      ]
                    }
                  ]
                }
                </output_format>

                %s
                """, langInstruction, langReminder);
    }

    private String buildUserPrompt(String featureTitle, String featureDescription, String existingTasksContext) {
        String desc = featureDescription != null && !featureDescription.isBlank()
                ? featureDescription
                : "(no description)";
        if (desc.length() > 3000) {
            desc = desc.substring(0, 3000) + "...";
        }

        return String.format("""
                Feature Title: %s

                Feature Description:
                %s

                Existing Tasks (do NOT duplicate these):
                %s

                Decompose this feature into actionable tasks with optional checklists.
                """, featureTitle, desc, existingTasksContext);
    }

    private String buildExistingTasksContext(List<Task> existingTasks) {
        if (existingTasks.isEmpty()) {
            return "(none)";
        }
        StringBuilder sb = new StringBuilder();
        for (Task t : existingTasks) {
            sb.append("- ").append(t.getTitle());
            if (t.getDescription() != null && !t.getDescription().isBlank()) {
                String desc = t.getDescription().length() > 100
                        ? t.getDescription().substring(0, 100) + "..."
                        : t.getDescription();
                sb.append(": ").append(desc);
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private FeatureAIResponse.TaskDecomposition parseAIResponse(String aiResponse, String featureId, String featureTitle) {
        try {
            String json = extractJson(aiResponse);
            JsonNode root = objectMapper.readTree(json);

            List<FeatureAIResponse.TaskSuggestion> tasks = new ArrayList<>();
            JsonNode tasksNode = root.get("tasks");

            if (tasksNode != null && tasksNode.isArray()) {
                for (JsonNode taskNode : tasksNode) {
                    List<FeatureAIResponse.ChecklistSuggestion> checklists = new ArrayList<>();
                    JsonNode checklistsNode = taskNode.get("checklists");

                    if (checklistsNode != null && checklistsNode.isArray()) {
                        for (JsonNode clNode : checklistsNode) {
                            checklists.add(FeatureAIResponse.ChecklistSuggestion.builder()
                                    .title(getTextOrNull(clNode, "title"))
                                    .build());
                        }
                    }

                    tasks.add(FeatureAIResponse.TaskSuggestion.builder()
                            .title(getTextOrNull(taskNode, "title"))
                            .description(getTextOrNull(taskNode, "description"))
                            .checklists(checklists)
                            .build());
                }
            }

            return FeatureAIResponse.TaskDecomposition.builder()
                    .featureId(featureId)
                    .featureTitle(featureTitle)
                    .tasks(tasks)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse AI response for feature: {}", featureId, e);
            throw new BusinessException(ErrorCode.AI_FEATURE_DECOMPOSE_FAILED);
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

    private String getTextOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        return value.asText();
    }

    private void validateTaskLimit(Board board) {
        Integer taskLimit = board.getTaskLimit();
        if (taskLimit != null) {
            int currentTaskCount = taskRepository.countByBoardId(board.getId());
            if (currentTaskCount >= taskLimit) {
                throw new BusinessException(ErrorCode.TASK_LIMIT_EXCEEDED);
            }
        }
    }
}
