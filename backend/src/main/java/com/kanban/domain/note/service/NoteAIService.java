package com.kanban.domain.note.service;

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
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.dto.NoteAIRequest;
import com.kanban.domain.note.dto.NoteAIResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NoteAIService {

    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final NoteRepository noteRepository;
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

    @Transactional
    public NoteAIResponse.Suggestions generateSuggestions(String boardId, String noteId, String userId, String language) {
        // Consume AI credit before processing
        aiCreditService.consumeCredit(boardId, userId, "NOTE_AI", 1);

        boardService.checkMemberOrAbove(boardId, userId);

        Note note = noteRepository.findByIdAndBoardId(noteId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));

        if (note.getIsDeleted()) {
            throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
        }

        if (note.isBoard()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "화이트보드에는 AI 정리를 사용할 수 없습니다");
        }

        String htmlContent = note.getContent();
        if (htmlContent == null || htmlContent.isBlank()) {
            throw new BusinessException(ErrorCode.AI_NOTE_CONTENT_EMPTY);
        }

        // Strip HTML tags to extract plain text for AI
        String plainText = stripHtml(htmlContent);
        if (plainText.isBlank()) {
            throw new BusinessException(ErrorCode.AI_NOTE_CONTENT_EMPTY);
        }

        // Build board context
        List<Feature> existingFeatures = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
        Map<String, List<Task>> featureTasksMap = new LinkedHashMap<>();
        for (Feature f : existingFeatures) {
            List<Task> tasks = taskRepository.findByFeatureIdOrderByPositionAsc(f.getId());
            featureTasksMap.put(f.getId(), tasks);
        }

        String boardContext = buildBoardContextJson(existingFeatures, featureTasksMap);
        String systemPrompt = buildSystemPrompt(language);
        String userPrompt = buildUserPrompt(note.getTitle(), plainText, boardContext);

        log.info("Generating AI suggestions for note: {} in board: {}", noteId, boardId);
        String model = getModel();
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS);

        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType("NOTE").provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }

        NoteAIResponse.Suggestions suggestions = parseAIResponse(aiResult.content(), noteId, note.getTitle());

        // Save AI suggestions and content snapshot to note
        try {
            String suggestionsJson = objectMapper.writeValueAsString(suggestions);
            note.updateAiSuggestions(suggestionsJson);
            note.updateAiContentSnapshot(htmlContent);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize AI suggestions for note: {}", noteId, e);
        }

        return suggestions;
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public NoteAIResponse.ApplyResult applySuggestions(String boardId, String noteId, String userId,
                                                        NoteAIRequest.Apply request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        int featuresCreated = 0;
        int tasksCreated = 0;
        int checklistsCreated = 0;
        List<String> createdFeatureIds = new ArrayList<>();
        List<String> createdTaskIds = new ArrayList<>();

        for (NoteAIRequest.FeatureSuggestionApply fs : request.getFeatures()) {
            Feature feature;

            if ("EXISTING".equals(fs.getType())) {
                feature = featureRepository.findById(fs.getFeatureId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
            } else {
                Integer maxPos = featureRepository.findMaxPositionByBoardId(boardId);
                int newPos = (maxPos != null) ? maxPos + 1 : 0;

                feature = Feature.builder()
                        .board(board)
                        .title(fs.getTitle())
                        .description(fs.getDescription())
                        .color(fs.getColor() != null ? fs.getColor() : "#6366F1")
                        .position(newPos)
                        .createdBy(creator)
                        .build();
                featureRepository.save(feature);
                createdFeatureIds.add(feature.getId());
                featuresCreated++;

                activityService.logActivity(board, creator,
                        ActivityAction.FEATURE_CREATED, TargetType.FEATURE, feature.getId(),
                        Map.of("featureTitle", feature.getTitle(),
                                "featureColor", feature.getColor()));
            }

            if (fs.getTasks() != null) {
                for (NoteAIRequest.TaskSuggestionApply ts : fs.getTasks()) {
                    validateTaskLimit(board);

                    Integer maxTaskPos = taskRepository.findMaxPositionByBlockId(taskBlock.getId());
                    int newTaskPos = (maxTaskPos != null) ? maxTaskPos + 1 : 0;

                    Task task = Task.builder()
                            .feature(feature)
                            .board(board)
                            .block(taskBlock)
                            .title(ts.getTitle())
                            .description(ts.getDescription())
                            .position(newTaskPos)
                            .createdBy(creator)
                            .build();
                    taskRepository.save(task);
                    feature.incrementTotalTasks();
                    createdTaskIds.add(task.getId());
                    tasksCreated++;

                    activityService.logActivity(board, creator,
                            ActivityAction.TASK_CREATED, TargetType.TASK, task.getId(),
                            Map.of("taskTitle", task.getTitle(),
                                    "featureTitle", feature.getTitle(),
                                    "featureColor", feature.getColor()));

                    if (ts.getChecklists() != null) {
                        for (NoteAIRequest.ChecklistSuggestionApply cs : ts.getChecklists()) {
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
            }
        }

        log.info("AI suggestions applied for note: {}. Features: {}, Tasks: {}, Checklists: {}",
                noteId, featuresCreated, tasksCreated, checklistsCreated);

        return NoteAIResponse.ApplyResult.builder()
                .featuresCreated(featuresCreated)
                .tasksCreated(tasksCreated)
                .checklistsCreated(checklistsCreated)
                .createdFeatureIds(createdFeatureIds)
                .createdTaskIds(createdTaskIds)
                .build();
    }

    // ===== HTML to Plain Text =====

    static String stripHtml(String html) {
        if (html == null) return "";
        // Replace block-level elements with newlines
        String text = html.replaceAll("(?i)<br\\s*/?>", "\n");
        text = text.replaceAll("(?i)</p>", "\n");
        text = text.replaceAll("(?i)</div>", "\n");
        text = text.replaceAll("(?i)</li>", "\n");
        text = text.replaceAll("(?i)</h[1-6]>", "\n");
        // Remove all remaining HTML tags
        text = text.replaceAll("<[^>]+>", "");
        // Decode common HTML entities
        text = text.replace("&amp;", "&");
        text = text.replace("&lt;", "<");
        text = text.replace("&gt;", ">");
        text = text.replace("&quot;", "\"");
        text = text.replace("&#39;", "'");
        text = text.replace("&nbsp;", " ");
        // Normalize whitespace
        text = text.replaceAll("[ \\t]+", " ");
        text = text.replaceAll("\\n{3,}", "\n\n");
        return text.trim();
    }

    // ===== Prompt Building =====

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

    private String getLanguageName(String lang) {
        if (lang == null) return null;
        return LANGUAGE_NAMES.getOrDefault(lang, LANGUAGE_NAMES.get("en"));
    }

    private String buildSystemPrompt(String language) {
        String langName = getLanguageName(language);
        String langInstruction = langName != null
                ? "- IMPORTANT: Write ALL output text (key_points, summary, feature/task/checklist titles and descriptions) in " + langName + "."
                : "- Match the language of the note content (Korean content → Korean output, English → English)";

        return String.format("""
                You are a project management assistant for the BRIDGE kanban tool.
                You receive a note/document and a list of existing features/tasks on the board.

                Your job is to:
                1. Analyze the note content and create a structured summary, clearly separating decisions, discussions, and action items
                2. Extract actionable items and organize them into Feature → Task → Checklist hierarchy

                <thinking_process>
                Before generating output, analyze step by step:
                1. Read the note content and identify distinct topics
                2. For each topic, classify content into: decisions (confirmed/agreed), ongoing discussions (unresolved), and action items (assigned work)
                3. Review the board's existing features — compare by TITLE and DESCRIPTION to find matches
                4. Only create NEW features when no existing feature covers the topic
                </thinking_process>

                <feature_matching_rules>
                CRITICAL: Prefer EXISTING over NEW. Follow these rules strictly:
                - Match by SEMANTIC SIMILARITY, not just exact title match
                - If the note topic overlaps with an existing feature's title OR description, use EXISTING
                - When in doubt between NEW and EXISTING, choose EXISTING
                - Only create NEW when the topic is genuinely unrelated to any existing feature
                - Never create a NEW feature with a title that duplicates or closely resembles an existing feature
                </feature_matching_rules>

                <rules>
                - Organize note content into clear topics grouped by work area
                - For each topic, separate into: decisions (what was decided/confirmed), discussions (what was debated but unresolved), and action_items (specific work to be done)
                - Items mentioned multiple times or emphasized are important (set important: true)
                - Identify key decisions and conclusions as key_points
                - Remove redundancy but preserve all unique information
                - Each task should be a concrete deliverable or work item
                - Checklist items should be specific, actionable sub-steps
                - Keep titles concise (under 100 characters)
                - Descriptions should provide context from the note content
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                %s
                - If there are no actionable items, still provide the summary and key_points
                </rules>

                <output_format>
                {
                  "key_points": ["Important point 1", "Important point 2"],
                  "summary": [
                    {
                      "topic": "Work area / Topic name",
                      "important": true,
                      "decisions": ["What was decided or confirmed"],
                      "discussions": ["What was discussed but not yet resolved"],
                      "action_items": ["Who needs to do what"]
                    }
                  ],
                  "features": [
                    {
                      "type": "NEW" or "EXISTING",
                      "feature_id": "uuid (EXISTING only, null for NEW)",
                      "title": "Feature title",
                      "description": "Brief feature description",
                      "color": "#hex (NEW only, pick from: #6366F1, #EC4899, #F59E0B, #10B981, #3B82F6, #EF4444, #8B5CF6, #14B8A6)",
                      "tasks": [
                        {
                          "title": "Task title",
                          "description": "What needs to be done",
                          "checklists": [
                            { "title": "Specific step or criterion" }
                          ]
                        }
                      ]
                    }
                  ]
                }
                </output_format>

                <example>
                Given board state: [{"id":"abc-123", "title":"User Authentication", "description":"Login, signup, password reset features", "tasks":[{"title":"Implement Google OAuth"}]}]
                And note mentions: "GitHub 소셜 로그인 추가 필요..."

                CORRECT: {"type":"EXISTING", "feature_id":"abc-123", ...} — GitHub social login belongs under the existing "User Authentication" feature.
                WRONG: {"type":"NEW", "title":"GitHub Login Feature", ...} — This would create an unnecessary duplicate.
                </example>
                """, langInstruction);
    }

    private String buildUserPrompt(String noteTitle, String noteContent, String boardContext) {
        String truncatedContent = noteContent.length() > 5000 ? noteContent.substring(0, 5000) + "..." : noteContent;
        return String.format("""
                Note Title: %s

                Note Content:
                %s

                Current Board State (existing features and their tasks):
                %s

                Analyze the note content and suggest features, tasks, and checklists to create.
                """, noteTitle, truncatedContent, boardContext);
    }

    private String buildBoardContextJson(List<Feature> features, Map<String, List<Task>> taskMap) {
        if (features.isEmpty()) {
            return "[]";
        }

        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < features.size(); i++) {
            Feature f = features.get(i);
            List<Task> tasks = taskMap.getOrDefault(f.getId(), List.of());
            String desc = f.getDescription() != null ? escapeJson(f.getDescription()) : "";

            sb.append(String.format("  {\"id\":\"%s\", \"title\":\"%s\", \"description\":\"%s\", \"tasks\": [",
                    f.getId(), escapeJson(f.getTitle()), desc));

            for (int j = 0; j < tasks.size(); j++) {
                Task t = tasks.get(j);
                String taskDesc = t.getDescription() != null ? escapeJson(t.getDescription()) : "";
                sb.append(String.format("{\"title\":\"%s\", \"description\":\"%s\"}", escapeJson(t.getTitle()), taskDesc));
                if (j < tasks.size() - 1) sb.append(", ");
            }

            sb.append("]}");
            if (i < features.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("]");
        return sb.toString();
    }

    private String escapeJson(String text) {
        if (text == null) return "";
        return text.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    // ===== AI Response Parsing =====

    private NoteAIResponse.Suggestions parseAIResponse(String aiResponse, String noteId, String noteTitle) {
        try {
            String json = extractJson(aiResponse);
            JsonNode root = objectMapper.readTree(json);

            List<String> keyPoints = new ArrayList<>();
            JsonNode keyPointsNode = root.get("key_points");
            if (keyPointsNode != null && keyPointsNode.isArray()) {
                for (JsonNode kp : keyPointsNode) {
                    if (kp.isTextual()) keyPoints.add(kp.asText());
                }
            }

            List<NoteAIResponse.SummaryTopic> summaryTopics = new ArrayList<>();
            JsonNode summaryNode = root.get("summary");
            if (summaryNode != null && summaryNode.isArray()) {
                for (JsonNode topicNode : summaryNode) {
                    List<String> points = parseStringArray(topicNode, "points");
                    List<String> decisions = parseStringArray(topicNode, "decisions");
                    List<String> discussions = parseStringArray(topicNode, "discussions");
                    List<String> actionItems = parseStringArray(topicNode, "action_items");
                    boolean important = topicNode.has("important") && topicNode.get("important").asBoolean();
                    summaryTopics.add(NoteAIResponse.SummaryTopic.builder()
                            .topic(getTextOrNull(topicNode, "topic"))
                            .important(important)
                            .points(points)
                            .decisions(decisions)
                            .discussions(discussions)
                            .actionItems(actionItems)
                            .build());
                }
            }

            JsonNode featuresNode = root.get("features");
            List<NoteAIResponse.FeatureSuggestion> features = new ArrayList<>();

            if (featuresNode != null && featuresNode.isArray()) {
                for (JsonNode featureNode : featuresNode) {
                    List<NoteAIResponse.TaskSuggestion> tasks = new ArrayList<>();
                    JsonNode tasksNode = featureNode.get("tasks");

                    if (tasksNode != null && tasksNode.isArray()) {
                        for (JsonNode taskNode : tasksNode) {
                            List<NoteAIResponse.ChecklistSuggestion> checklists = new ArrayList<>();
                            JsonNode checklistsNode = taskNode.get("checklists");

                            if (checklistsNode != null && checklistsNode.isArray()) {
                                for (JsonNode clNode : checklistsNode) {
                                    checklists.add(NoteAIResponse.ChecklistSuggestion.builder()
                                            .title(getTextOrNull(clNode, "title"))
                                            .build());
                                }
                            }

                            tasks.add(NoteAIResponse.TaskSuggestion.builder()
                                    .title(getTextOrNull(taskNode, "title"))
                                    .description(getTextOrNull(taskNode, "description"))
                                    .checklists(checklists)
                                    .build());
                        }
                    }

                    features.add(NoteAIResponse.FeatureSuggestion.builder()
                            .type(getTextOrNull(featureNode, "type"))
                            .featureId(getTextOrNull(featureNode, "feature_id"))
                            .title(getTextOrNull(featureNode, "title"))
                            .description(getTextOrNull(featureNode, "description"))
                            .color(getTextOrNull(featureNode, "color"))
                            .tasks(tasks)
                            .build());
                }
            }

            return NoteAIResponse.Suggestions.builder()
                    .noteId(noteId)
                    .noteTitle(noteTitle)
                    .keyPoints(keyPoints)
                    .summary(summaryTopics)
                    .features(features)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse AI response for note: {}", noteId, e);
            throw new BusinessException(ErrorCode.AI_NOTE_PARSE_FAILED);
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

    private void validateTaskLimit(Board board) {
        Integer taskLimit = board.getTaskLimit();
        if (taskLimit != null) {
            int currentTaskCount = taskRepository.countByBoardId(board.getId());
            if (currentTaskCount >= taskLimit) {
                log.warn("Task limit exceeded for board: {} (current: {}, limit: {})",
                        board.getId(), currentTaskCount, taskLimit);
                throw new BusinessException(ErrorCode.TASK_LIMIT_EXCEEDED);
            }
        }
    }
}
