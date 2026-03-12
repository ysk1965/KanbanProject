package com.kanban.domain.meeting.service;

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
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingAIRequest;
import com.kanban.domain.meeting.dto.MeetingAIResponse;
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
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
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
public class MeetingAIService {

    private final AIProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final MeetingRepository meetingRepository;
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
    private String claudeMeetingModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiMeetingModel;

    private static final int MAX_TOKENS_MEETING = 8192;

    private String getMeetingModel() {
        return "openai".equals(provider) ? openaiMeetingModel : claudeMeetingModel;
    }

    @Transactional
    public MeetingAIResponse.Suggestions generateSuggestions(String boardId, String meetingId, String userId, String language) {
        // Consume AI credit before processing
        aiCreditService.consumeCredit(boardId, userId, "MEETING_AI", 1);

        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        String memo = meeting.getMemo();
        String transcript = meeting.getTranscript();

        String combinedContent = "";
        if (memo != null && !memo.isBlank()) {
            combinedContent += memo;
        }
        if (transcript != null && !transcript.isBlank()) {
            if (!combinedContent.isEmpty()) combinedContent += "\n\n---\n\n";
            combinedContent += "[Transcript]\n" + transcript;
        }
        if (combinedContent.isBlank()) {
            throw new BusinessException(ErrorCode.AI_MEETING_MEMO_EMPTY);
        }

        List<Feature> existingFeatures = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
        Map<String, List<Task>> featureTasksMap = new LinkedHashMap<>();
        for (Feature f : existingFeatures) {
            List<Task> tasks = taskRepository.findByFeatureIdOrderByPositionAsc(f.getId());
            featureTasksMap.put(f.getId(), tasks);
        }

        String boardContext = buildBoardContextJson(existingFeatures, featureTasksMap);
        String systemPrompt = buildSystemPrompt(language);
        String userPrompt = buildUserPrompt(meeting.getTitle(), combinedContent, boardContext);

        log.info("Generating AI suggestions for meeting: {} in board: {}", meetingId, boardId);
        String model = getMeetingModel();
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS_MEETING);

        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType("MEETING").provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }

        MeetingAIResponse.Suggestions suggestions = parseAIResponse(aiResult.content(), meetingId, meeting.getTitle());

        // Save AI suggestions to meeting for persistence
        try {
            String suggestionsJson = objectMapper.writeValueAsString(suggestions);
            meeting.updateAiSuggestions(suggestionsJson);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize AI suggestions for meeting: {}", meetingId, e);
        }

        // Broadcast WebSocket event so other users see the AI summary in real-time
        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null, Map.of("meetingId", meetingId));

        return suggestions;
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public MeetingAIResponse.ApplyResult applySuggestions(String boardId, String meetingId, String userId,
                                                           MeetingAIRequest.Apply request) {
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

        for (MeetingAIRequest.FeatureSuggestionApply fs : request.getFeatures()) {
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
                for (MeetingAIRequest.TaskSuggestionApply ts : fs.getTasks()) {
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
                        for (MeetingAIRequest.ChecklistSuggestionApply cs : ts.getChecklists()) {
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

        log.info("AI suggestions applied for meeting: {}. Features: {}, Tasks: {}, Checklists: {}",
                meetingId, featuresCreated, tasksCreated, checklistsCreated);

        return MeetingAIResponse.ApplyResult.builder()
                .featuresCreated(featuresCreated)
                .tasksCreated(tasksCreated)
                .checklistsCreated(checklistsCreated)
                .createdFeatureIds(createdFeatureIds)
                .createdTaskIds(createdTaskIds)
                .build();
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

    private String getLanguageName(String lang) {
        if (lang == null) return null;
        return LANGUAGE_NAMES.getOrDefault(lang, LANGUAGE_NAMES.get("en"));
    }

    private String buildSystemPrompt(String language) {
        String langName = getLanguageName(language);
        String langInstruction;
        String langReminder;
        if (langName != null) {
            langInstruction = "CRITICAL LANGUAGE RULE: You MUST write ALL output text in " + langName + ". " +
                    "Every value in key_points, summary (topic, decisions, discussions, action_items), " +
                    "and features (title, description), tasks (title, description), checklists (title) MUST be in " + langName + ". " +
                    "Do NOT use English for any content values.";
            langReminder = "REMINDER: All text content in the JSON output MUST be in " + langName + ". This is mandatory.";
        } else {
            langInstruction = "CRITICAL LANGUAGE RULE: You MUST match the language of the meeting memo/transcript. " +
                    "If the transcript is in Korean, write ALL output in Korean. If in English, write in English. " +
                    "Detect the language from the transcript and use that same language for all output values.";
            langReminder = "REMINDER: Match the output language to the transcript language.";
        }

        return String.format("""
                You are a project management assistant for the BRIDGE kanban tool.
                You receive a meeting memo/transcript and a list of existing features/tasks on the board.

                %s

                Your job is to:
                1. Create a well-organized meeting summary grouped by work topics, clearly separating decisions, discussions, and action items
                2. Extract actionable items and organize them into Feature → Task → Checklist hierarchy

                <thinking_process>
                Before generating output, analyze step by step:
                1. Read the meeting content and identify distinct topics
                2. For each topic, classify content into: decisions (confirmed/agreed), ongoing discussions (unresolved), and action items (assigned work)
                3. Review the board's existing features — compare by TITLE and DESCRIPTION to find matches
                4. Only create NEW features when no existing feature covers the topic
                </thinking_process>

                <feature_matching_rules>
                CRITICAL: Prefer EXISTING over NEW. Follow these rules strictly:
                - Match by SEMANTIC SIMILARITY, not just exact title match
                - If the meeting topic overlaps with an existing feature's title OR description, use EXISTING
                - When in doubt between NEW and EXISTING, choose EXISTING
                - Only create NEW when the topic is genuinely unrelated to any existing feature
                - Never create a NEW feature with a title that duplicates or closely resembles an existing feature
                </feature_matching_rules>

                <rules>
                - Organize meeting content into clear topics grouped by work area
                - For each topic, separate into: decisions (what was decided/confirmed), discussions (what was debated but unresolved), and action_items (specific work assigned to people)
                - Items mentioned multiple times or by multiple speakers are important (set important: true)
                - Identify key decisions and conclusions as key_points
                - Remove redundancy but preserve all unique information
                - Each task should be a concrete deliverable or work item
                - Checklist items should be specific, actionable sub-steps
                - Keep titles concise (under 100 characters)
                - Descriptions should provide context from the meeting discussion
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                - If there are no actionable items, still provide the summary and key_points
                </rules>

                <output_format>
                {
                  "key_points": ["(content in transcript language)", "(content in transcript language)"],
                  "summary": [
                    {
                      "topic": "(topic name in transcript language)",
                      "important": true,
                      "decisions": ["(decision in transcript language)"],
                      "discussions": ["(discussion in transcript language)"],
                      "action_items": ["(action item in transcript language)"]
                    }
                  ],
                  "features": [
                    {
                      "type": "NEW" or "EXISTING",
                      "feature_id": "uuid (EXISTING only, null for NEW)",
                      "title": "(feature title in transcript language)",
                      "description": "(description in transcript language)",
                      "color": "#hex (NEW only, pick from: #6366F1, #EC4899, #F59E0B, #10B981, #3B82F6, #EF4444, #8B5CF6, #14B8A6)",
                      "tasks": [
                        {
                          "title": "(task title in transcript language)",
                          "description": "(description in transcript language)",
                          "checklists": [
                            { "title": "(checklist item in transcript language)" }
                          ]
                        }
                      ]
                    }
                  ]
                }
                </output_format>

                <example>
                Given board state: [{"id":"abc-123", "title":"User Authentication", "description":"Login, signup, password reset features", "tasks":[{"title":"Implement Google OAuth"}]}]
                And meeting memo mentions: "We discussed adding social login via GitHub..."

                CORRECT: {"type":"EXISTING", "feature_id":"abc-123", ...} — GitHub social login belongs under the existing "User Authentication" feature.
                WRONG: {"type":"NEW", "title":"GitHub Login Feature", ...} — This would create an unnecessary duplicate.
                </example>

                %s
                """, langInstruction, langReminder);
    }

    private String buildUserPrompt(String meetingTitle, String memo, String boardContext) {
        String truncatedMemo = memo.length() > 5000 ? memo.substring(0, 5000) + "..." : memo;
        return String.format("""
                Meeting Title: %s

                Meeting Memo:
                %s

                Current Board State (existing features and their tasks):
                %s

                Analyze the meeting memo and suggest features, tasks, and checklists to create.
                """, meetingTitle, truncatedMemo, boardContext);
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

    private MeetingAIResponse.Suggestions parseAIResponse(String aiResponse, String meetingId, String meetingTitle) {
        try {
            String json = extractJson(aiResponse);
            JsonNode root = objectMapper.readTree(json);

            // Parse key_points
            List<String> keyPoints = new ArrayList<>();
            JsonNode keyPointsNode = root.get("key_points");
            if (keyPointsNode != null && keyPointsNode.isArray()) {
                for (JsonNode kp : keyPointsNode) {
                    if (kp.isTextual()) keyPoints.add(kp.asText());
                }
            }

            // Parse summary topics
            List<MeetingAIResponse.SummaryTopic> summaryTopics = new ArrayList<>();
            JsonNode summaryNode = root.get("summary");
            if (summaryNode != null && summaryNode.isArray()) {
                for (JsonNode topicNode : summaryNode) {
                    List<String> points = parseStringArray(topicNode, "points");
                    List<String> decisions = parseStringArray(topicNode, "decisions");
                    List<String> discussions = parseStringArray(topicNode, "discussions");
                    List<String> actionItems = parseStringArray(topicNode, "action_items");
                    boolean important = topicNode.has("important") && topicNode.get("important").asBoolean();
                    summaryTopics.add(MeetingAIResponse.SummaryTopic.builder()
                            .topic(getTextOrNull(topicNode, "topic"))
                            .important(important)
                            .points(points)
                            .decisions(decisions)
                            .discussions(discussions)
                            .actionItems(actionItems)
                            .build());
                }
            }

            // Parse features
            JsonNode featuresNode = root.get("features");
            List<MeetingAIResponse.FeatureSuggestion> features = new ArrayList<>();

            if (featuresNode != null && featuresNode.isArray()) {
                for (JsonNode featureNode : featuresNode) {
                    List<MeetingAIResponse.TaskSuggestion> tasks = new ArrayList<>();
                    JsonNode tasksNode = featureNode.get("tasks");

                    if (tasksNode != null && tasksNode.isArray()) {
                        for (JsonNode taskNode : tasksNode) {
                            List<MeetingAIResponse.ChecklistSuggestion> checklists = new ArrayList<>();
                            JsonNode checklistsNode = taskNode.get("checklists");

                            if (checklistsNode != null && checklistsNode.isArray()) {
                                for (JsonNode clNode : checklistsNode) {
                                    checklists.add(MeetingAIResponse.ChecklistSuggestion.builder()
                                            .title(getTextOrNull(clNode, "title"))
                                            .build());
                                }
                            }

                            tasks.add(MeetingAIResponse.TaskSuggestion.builder()
                                    .title(getTextOrNull(taskNode, "title"))
                                    .description(getTextOrNull(taskNode, "description"))
                                    .checklists(checklists)
                                    .build());
                        }
                    }

                    features.add(MeetingAIResponse.FeatureSuggestion.builder()
                            .type(getTextOrNull(featureNode, "type"))
                            .featureId(getTextOrNull(featureNode, "feature_id"))
                            .title(getTextOrNull(featureNode, "title"))
                            .description(getTextOrNull(featureNode, "description"))
                            .color(getTextOrNull(featureNode, "color"))
                            .tasks(tasks)
                            .build());
                }
            }

            return MeetingAIResponse.Suggestions.builder()
                    .meetingId(meetingId)
                    .meetingTitle(meetingTitle)
                    .keyPoints(keyPoints)
                    .summary(summaryTopics)
                    .features(features)
                    .build();

        } catch (JsonProcessingException e) {
            log.error("Failed to parse AI response for meeting: {}", meetingId, e);
            throw new BusinessException(ErrorCode.AI_MEETING_PARSE_FAILED);
        }
    }

    private String extractJson(String response) {
        if (response == null) return "{}";
        String trimmed = response.trim();

        // Strip markdown code fences if present
        if (trimmed.startsWith("```")) {
            int firstNewline = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                trimmed = trimmed.substring(firstNewline + 1, lastFence).trim();
            }
        }

        // Find first { and last }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }

        // Truncated JSON recovery: close unclosed brackets/braces
        if (start >= 0) {
            String partial = trimmed.substring(start);
            log.warn("Attempting truncated JSON recovery ({} chars)", partial.length());
            partial = repairTruncatedJson(partial);
            return partial;
        }

        return trimmed;
    }

    /**
     * 토큰 제한으로 잘린 JSON을 복구: 열린 괄호/배열을 닫아줌
     */
    private String repairTruncatedJson(String json) {
        // Remove trailing incomplete string/value (cut at last complete token)
        int lastComplete = -1;
        for (int i = json.length() - 1; i >= 0; i--) {
            char c = json.charAt(i);
            if (c == ',' || c == '{' || c == '[' || c == ':' || c == '"'
                    || c == '}' || c == ']') {
                lastComplete = i;
                break;
            }
        }
        if (lastComplete > 0) {
            char lastChar = json.charAt(lastComplete);
            // Trim trailing comma or colon (incomplete entry)
            if (lastChar == ',' || lastChar == ':') {
                json = json.substring(0, lastComplete);
            } else if (lastChar == '"') {
                // Check if inside an unclosed string — close it
                json = json.substring(0, lastComplete + 1);
            } else {
                json = json.substring(0, lastComplete + 1);
            }
        }

        // Count open brackets and close them
        int braces = 0, brackets = 0;
        boolean inString = false;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && inString) { i++; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '{') braces++;
            else if (c == '}') braces--;
            else if (c == '[') brackets++;
            else if (c == ']') brackets--;
        }

        StringBuilder sb = new StringBuilder(json);
        while (brackets > 0) { sb.append(']'); brackets--; }
        while (braces > 0) { sb.append('}'); braces--; }
        return sb.toString();
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
