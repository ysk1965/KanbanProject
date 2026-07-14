package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.dto.JiraRequest;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TagRepository;
import com.kanban.domain.tag.TaskTag;
import com.kanban.domain.tag.TaskTagRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.service.TaskKeyAllocator;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

/**
 * JIRA 이슈 → BRIDGE 카드 가져오기.
 *
 * 2-패스: (1) 에픽 → Feature, (2) 이슈 → Task(소속 Feature 하위).
 * - 담당자: Epic은 Feature.assignee 직접, 이슈는 ChecklistItem으로 이관(담당자 사다리로 BRIDGE 멤버 해석).
 * - 첨부: JIRA 바이트 → S3 직접 업로드 → Task 댓글(알림 없이 직접 build).
 * - priority/component → Tag.
 * - 마일스톤: 오늘 걸치는 현재 마일스톤 자동 배정.
 * - 원장(JiraIssueLink): 이미 있는 이슈는 스킵(재가져오기 시 BRIDGE 수정분 보존).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraImportService {

    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 50;
    private static final String DEFAULT_TAG_COLOR = "#94a3b8";

    private final JiraApiClient jiraApiClient;
    private final JiraIssueMapper mapper;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final SlackTokenEncryptor tokenEncryptor;
    private final ObjectMapper objectMapper;

    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BlockRepository blockRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final CommentRepository commentRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final TagRepository tagRepository;
    private final TaskTagRepository taskTagRepository;
    private final MilestoneRepository milestoneRepository;
    private final FileUploadService fileUploadService;
    private final TaskKeyAllocator taskKeyAllocator;

    @Transactional
    public JiraResponse.ImportResult importIssues(String boardId, String userId, JiraRequest.Import request) {
        boardService.checkMemberOrAbove(boardId, userId);
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        String token = tokenEncryptor.decrypt(config.getApiTokenEncrypted());
        String jql = resolveJql(request, config);

        List<ParsedJiraIssue> issues;
        try {
            issues = fetchAll(config, token, jql);
        } catch (BusinessException e) {
            config.markError(e.getMessage());
            throw e;
        }

        if (request.isPreview()) {
            long epics = issues.stream().filter(ParsedJiraIssue::isEpic).count();
            return JiraResponse.ImportResult.builder()
                .total(issues.size()).created(0).updated(0).skipped(0)
                .features((int) epics).tasks((int) (issues.size() - epics))
                .checklists(0).comments(0).errors(List.of()).build();
        }

        Board board = boardRepository.findByIdWithLock(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User importer = userRepository.findById(userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Map<String, String> statusToBlock = readMap(config.getStatusToBlockJson());
        Map<String, String> priorityToTag = readMap(config.getPriorityToTagJson());
        Map<String, String> componentToTag = readMap(config.getComponentToTagJson());

        Milestone currentMilestone = Boolean.TRUE.equals(config.getMilestoneAutoAssign())
            ? resolveCurrentMilestone(boardId) : null;
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
            .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // 기존 링크: 중복 스킵 + 에픽 key→featureId 역참조
        List<JiraIssueLink> existing = issueLinkRepository.findByBoardId(boardId);
        Set<String> existingKeys = new HashSet<>();
        Map<String, String> keyToFeatureId = new HashMap<>();
        for (JiraIssueLink link : existing) {
            existingKeys.add(link.getJiraIssueKey());
            if (link.getTargetType() == JiraLinkTargetType.FEATURE) {
                keyToFeatureId.put(link.getJiraIssueKey(), link.getTargetId());
            }
        }

        Counters c = new Counters();
        c.skipped = (int) issues.stream().filter(i -> existingKeys.contains(i.key())).count();

        // ── PASS 1: 에픽 → Feature ──
        for (ParsedJiraIssue issue : issues) {
            if (!issue.isEpic() || existingKeys.contains(issue.key())) continue;
            User assignee = resolveAssignee(board, members, issue.assigneeAccountId(), issue.assigneeDisplayName());
            Feature feature = createFeature(board, importer, issue, assignee);
            saveLink(board, issue, JiraLinkTargetType.FEATURE, feature.getId());
            keyToFeatureId.put(issue.key(), feature.getId());
            c.features++;
            c.created++;
        }

        Feature fallbackFeature = null;

        // ── PASS 2: 이슈 → Task ──
        for (ParsedJiraIssue issue : issues) {
            if (issue.isEpic() || existingKeys.contains(issue.key())) continue;
            Feature feature = null;
            if (issue.parentKey() != null && keyToFeatureId.containsKey(issue.parentKey())) {
                feature = featureRepository.findById(keyToFeatureId.get(issue.parentKey())).orElse(null);
            }
            if (feature == null) {
                if (fallbackFeature == null) fallbackFeature = createFallbackFeature(board, importer);
                feature = fallbackFeature;
            }

            Task task = createTask(board, importer, feature, issue, statusToBlock, taskBlock, currentMilestone);
            saveLink(board, issue, JiraLinkTargetType.TASK, task.getId());
            c.tasks++;
            c.created++;

            // 담당자 → ChecklistItem
            User assignee = resolveAssignee(board, members, issue.assigneeAccountId(), issue.assigneeDisplayName());
            if (assignee != null) {
                createAssigneeChecklist(task, assignee, issue.assigneeDisplayName());
                c.checklists++;
            }

            // priority / component → Tag
            applyTag(task, resolveTag(board, issue.priorityName(), priorityToTag));
            for (String comp : issue.componentNames()) {
                applyTag(task, resolveTag(board, comp, componentToTag));
            }

            // 첨부 → 댓글 (개별 실패는 무시하고 계속)
            for (ParsedJiraIssue.Attachment att : issue.attachments()) {
                try {
                    importAttachmentAsComment(board, importer, task, att, config, token);
                    c.comments++;
                } catch (Exception ex) {
                    log.warn("JIRA attachment import failed ({} / {}): {}", issue.key(), att.filename(), ex.getMessage());
                    c.errors.add(issue.key() + " 첨부 '" + att.filename() + "' 실패");
                }
            }
        }

        config.markSynced();
        log.info("JIRA import to board {}: created={} skipped={} (F{} T{} CL{} C{})",
            boardId, c.created, c.skipped, c.features, c.tasks, c.checklists, c.comments);

        return JiraResponse.ImportResult.builder()
            .total(issues.size()).created(c.created).updated(0).skipped(c.skipped)
            .features(c.features).tasks(c.tasks).checklists(c.checklists).comments(c.comments)
            .errors(c.errors).build();
    }

    // ── fetch ─────────────────────────────────────

    private List<ParsedJiraIssue> fetchAll(JiraIntegrationConfig config, String token, String jql) {
        List<ParsedJiraIssue> out = new ArrayList<>();
        String nextPageToken = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            JsonNode result = jiraApiClient.searchIssues(config.getBaseUrl(), config.getAccountEmail(), token,
                jql, nextPageToken, PAGE_SIZE);
            JsonNode issuesNode = result != null ? result.get("issues") : null;
            if (issuesNode != null && issuesNode.isArray()) {
                for (JsonNode issue : issuesNode) {
                    ParsedJiraIssue parsed = mapper.parse(issue);
                    if (parsed.key() != null) out.add(parsed);
                }
            }
            JsonNode tokenNode = result != null ? result.get("nextPageToken") : null;
            if (tokenNode == null || tokenNode.isNull() || tokenNode.asText().isBlank()) break;
            nextPageToken = tokenNode.asText();
        }
        return out;
    }

    // ── 생성 헬퍼 ─────────────────────────────────

    private Feature createFeature(Board board, User importer, ParsedJiraIssue epic, User assignee) {
        Integer maxPos = featureRepository.findMaxPositionByBoardId(board.getId());
        Feature feature = Feature.builder()
            .board(board)
            .title(truncate(epic.summary(), 200))
            .description(epic.description())
            .assignee(assignee)
            .createdBy(importer)
            .position(maxPos != null ? maxPos + 1 : 0)
            .build();
        return featureRepository.save(feature);
    }

    private Feature createFallbackFeature(Board board, User importer) {
        Integer maxPos = featureRepository.findMaxPositionByBoardId(board.getId());
        Feature feature = Feature.builder()
            .board(board)
            .title("JIRA 가져오기")
            .description("에픽이 없는 JIRA 이슈가 담기는 기본 Feature")
            .createdBy(importer)
            .position(maxPos != null ? maxPos + 1 : 0)
            .build();
        return featureRepository.save(feature);
    }

    private Task createTask(Board board, User importer, Feature feature, ParsedJiraIssue issue,
                            Map<String, String> statusToBlock, Block taskBlock, Milestone milestone) {
        Block block = resolveBlock(board.getId(), issue.statusName(), statusToBlock, taskBlock);

        if (board.getKeyPrefix() == null || board.getKeyPrefix().isBlank()) {
            board.assignKeyPrefixIfAbsent(taskKeyAllocator.allocateUniquePrefix(board.getName()));
        }
        int taskNumber = board.nextTaskNumber();
        String taskKey = board.getKeyPrefix() + "-" + taskNumber;

        Integer maxPos = taskRepository.findMaxPositionByBlockId(block.getId());
        Integer maxFeaturePos = taskRepository.findMaxFeaturePositionByFeatureId(feature.getId());

        Task task = Task.builder()
            .feature(feature)
            .board(board)
            .block(block)
            .milestone(milestone)
            .title(truncate(issue.summary(), 200))
            .description(issue.description())
            .position(maxPos != null ? maxPos + 1 : 0)
            .featurePosition(maxFeaturePos != null ? maxFeaturePos + 1 : 0)
            .taskNumber(taskNumber)
            .taskKey(taskKey)
            .createdBy(importer)
            .build();
        taskRepository.save(task);
        feature.incrementTotalTasks();
        return task;
    }

    private void createAssigneeChecklist(Task task, User assignee, String displayName) {
        ChecklistItem item = ChecklistItem.builder()
            .task(task)
            .title("담당: " + (displayName != null ? displayName : "이슈 처리"))
            .assignee(assignee)
            .position(0)
            .build();
        checklistItemRepository.save(item);
    }

    private void importAttachmentAsComment(Board board, User importer, Task task,
                                           ParsedJiraIssue.Attachment att, JiraIntegrationConfig config, String token) {
        byte[] data = jiraApiClient.downloadAttachment(att.contentUrl(), config.getAccountEmail(), token);

        Comment comment = Comment.builder()
            .task(task)
            .board(board)
            .author(importer)
            .content("📎 JIRA 첨부: " + att.filename())
            .build();
        commentRepository.save(comment);

        String ext = extension(att.filename());
        String key = "comments/" + board.getId() + "/" + comment.getId() + "/" + UUID.randomUUID() + ext;
        String url = fileUploadService.uploadDirect(data, key, att.mimeType());

        CommentAttachment attachment = CommentAttachment.builder()
            .comment(comment)
            .originalFileName(att.filename())
            .s3Key(key)
            .url(url)
            .contentType(att.mimeType())
            .fileSize(att.size() > 0 ? att.size() : (long) data.length)
            .build();
        commentAttachmentRepository.save(attachment);
    }

    // ── 해석 헬퍼 ─────────────────────────────────

    private Block resolveBlock(String boardId, String statusName, Map<String, String> statusToBlock, Block defaultBlock) {
        if (statusName != null && statusToBlock.containsKey(statusName)) {
            String blockId = statusToBlock.get(statusName);
            Block block = blockRepository.findById(blockId).orElse(null);
            if (block != null && block.getBoard() != null && boardId.equals(block.getBoard().getId())) {
                return block;
            }
        }
        return defaultBlock;
    }

    private Milestone resolveCurrentMilestone(String boardId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId).stream()
            .filter(m -> !today.isBefore(m.getStartDate()) && !today.isAfter(m.getEndDate()))
            .min(Comparator.comparing(Milestone::getEndDate))
            .orElse(null);
    }

    /** 담당자 사다리: 저장된 매핑 → 이름 일치 → 미배정. 결과는 accountId로 영구 저장. */
    private User resolveAssignee(Board board, List<BoardMember> members, String accountId, String displayName) {
        if (accountId == null) return null;

        Optional<JiraUserMapping> stored = userMappingRepository.findByBoardIdAndJiraAccountId(board.getId(), accountId);
        if (stored.isPresent()) {
            return stored.get().getBridgeUser();
        }

        User matched = null;
        if (displayName != null) {
            matched = members.stream()
                .map(BoardMember::getUser)
                .filter(u -> u != null && displayName.equalsIgnoreCase(u.getName()))
                .findFirst()
                .orElse(null);
        }

        userMappingRepository.save(JiraUserMapping.builder()
            .board(board)
            .jiraAccountId(accountId)
            .jiraDisplayName(displayName)
            .bridgeUser(matched)
            .build());
        return matched;
    }

    private Tag resolveTag(Board board, String jiraValue, Map<String, String> mapping) {
        if (jiraValue == null || jiraValue.isBlank()) return null;

        if (mapping.containsKey(jiraValue)) {
            Tag mapped = tagRepository.findById(mapping.get(jiraValue)).orElse(null);
            if (mapped != null && mapped.getBoard() != null && board.getId().equals(mapped.getBoard().getId())) {
                return mapped;
            }
        }
        return tagRepository.findByBoardIdAndName(board.getId(), jiraValue)
            .orElseGet(() -> tagRepository.save(Tag.builder()
                .board(board).name(truncate(jiraValue, 50)).color(DEFAULT_TAG_COLOR).build()));
    }

    private void applyTag(Task task, Tag tag) {
        if (tag == null) return;
        if (!taskTagRepository.existsByTaskIdAndTagId(task.getId(), tag.getId())) {
            taskTagRepository.save(TaskTag.create(task, tag));
        }
    }

    private void saveLink(Board board, ParsedJiraIssue issue, JiraLinkTargetType type, String targetId) {
        issueLinkRepository.save(JiraIssueLink.builder()
            .board(board)
            .jiraIssueKey(issue.key())
            .jiraIssueId(issue.id())
            .targetType(type)
            .targetId(targetId)
            .jiraUpdatedAt(issue.updated())
            .build());
    }

    // ── 유틸 ──────────────────────────────────────

    private String resolveJql(JiraRequest.Import request, JiraIntegrationConfig config) {
        if (request != null && request.getJql() != null && !request.getJql().isBlank()) return request.getJql();
        if (config.getJql() != null && !config.getJql().isBlank()) return config.getJql();
        return "project = " + config.getProjectKey();
    }

    private Map<String, String> readMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            log.warn("JIRA mapping JSON parse failed: {}", e.getMessage());
            return Map.of();
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }

    private String extension(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot) : "";
    }

    private static class Counters {
        int created, updated, skipped, features, tasks, checklists, comments;
        final List<String> errors = new ArrayList<>();
    }
}
