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
import com.kanban.global.config.AIProvider;
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

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.meeting:claude-haiku-4-5-20251001}")
    private String claudeMeetingModel;

    @Value("${ai.openai.model.meeting:gpt-4o-mini}")
    private String openaiMeetingModel;

    private static final int MAX_TOKENS_MEETING = 4096;

    private String getMeetingModel() {
        return "openai".equals(provider) ? openaiMeetingModel : claudeMeetingModel;
    }

    public MeetingAIResponse.Suggestions generateSuggestions(String boardId, String meetingId, String userId) {
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
        Map<String, List<String>> featureTasksMap = new LinkedHashMap<>();
        for (Feature f : existingFeatures) {
            List<String> taskTitles = taskRepository.findByFeatureIdOrderByPositionAsc(f.getId()).stream()
                    .map(Task::getTitle)
                    .toList();
            featureTasksMap.put(f.getId(), taskTitles);
        }

        String boardContext = buildBoardContextJson(existingFeatures, featureTasksMap);
        String systemPrompt = buildSystemPrompt();
        String userPrompt = buildUserPrompt(meeting.getTitle(), combinedContent, boardContext);

        log.info("Generating AI suggestions for meeting: {} in board: {}", meetingId, boardId);
        String aiResponse = aiProvider.chat(systemPrompt, userPrompt, getMeetingModel(), MAX_TOKENS_MEETING);

        return parseAIResponse(aiResponse, meetingId, meeting.getTitle());
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public MeetingAIResponse.ApplyResult applySuggestions(String boardId, String meetingId, String userId,
                                                           MeetingAIRequest.Apply request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        board.checkAndUpdateTierIfTrialExpired();

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

    private String buildSystemPrompt() {
        return """
                You are a project management assistant for the BRIDGE kanban tool.
                You receive a meeting memo/transcript and a list of existing features/tasks on the board.

                Your job is to:
                1. Create a well-organized meeting summary grouped by work topics
                2. Extract actionable items and organize them into Feature → Task → Checklist hierarchy

                <rules>
                - First, organize the meeting content into clear topics grouped by work area
                - Items mentioned multiple times or by multiple speakers are important (set important: true)
                - Identify key decisions and conclusions as key_points
                - Remove redundancy but preserve all unique information
                - Map actionable items to EXISTING features when the topic clearly matches
                - Create NEW features only when the topic is genuinely new
                - Each task should be a concrete deliverable or work item
                - Checklist items should be specific, actionable sub-steps
                - Keep titles concise (under 100 characters)
                - Descriptions should provide context from the meeting discussion
                - Respond ONLY with valid JSON (no markdown code fences, no explanation text)
                - Match the language of the meeting memo (Korean memo → Korean output, English → English)
                - If there are no actionable items, still provide the summary and key_points
                </rules>

                <output_format>
                {
                  "key_points": ["Important decision or conclusion 1", "Important decision 2"],
                  "summary": [
                    {
                      "topic": "Work area / Discussion topic name",
                      "important": true,
                      "points": ["Discussion point 1", "Discussion point 2"]
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
                """;
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

    private String buildBoardContextJson(List<Feature> features, Map<String, List<String>> taskMap) {
        if (features.isEmpty()) {
            return "[]";
        }

        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < features.size(); i++) {
            Feature f = features.get(i);
            List<String> tasks = taskMap.getOrDefault(f.getId(), List.of());

            sb.append(String.format("  {\"id\":\"%s\", \"title\":\"%s\", \"tasks\": [",
                    f.getId(), escapeJson(f.getTitle())));

            for (int j = 0; j < tasks.size(); j++) {
                sb.append(String.format("\"%s\"", escapeJson(tasks.get(j))));
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
                    List<String> points = new ArrayList<>();
                    JsonNode pointsNode = topicNode.get("points");
                    if (pointsNode != null && pointsNode.isArray()) {
                        for (JsonNode p : pointsNode) {
                            if (p.isTextual()) points.add(p.asText());
                        }
                    }
                    boolean important = topicNode.has("important") && topicNode.get("important").asBoolean();
                    summaryTopics.add(MeetingAIResponse.SummaryTopic.builder()
                            .topic(getTextOrNull(topicNode, "topic"))
                            .important(important)
                            .points(points)
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
                log.warn("Task limit exceeded for board: {} (current: {}, limit: {})",
                        board.getId(), currentTaskCount, taskLimit);
                throw new BusinessException(ErrorCode.TASK_LIMIT_EXCEEDED);
            }
        }
    }
}
