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
 * 그룹핑: 프로젝트(Space) → Feature, 그 프로젝트의 모든 이슈 → Task(해당 Feature 하위).
 * - 에픽: 그룹핑에 쓰지 않으므로 가져오지 않음(무시).
 * - Feature 재사용: 프로젝트키를 원장(FEATURE 링크)에 기록해 재가져오기 때 같은 Feature에 append.
 * - 담당자: ChecklistItem으로 이관(담당자 사다리로 BRIDGE 멤버 해석).
 * - 첨부: JIRA 바이트 → S3 직접 업로드 → Task 댓글(알림 없이 직접 build).
 * - priority/component → Tag.
 * - 마일스톤: 오늘 걸치는 현재 마일스톤 자동 배정(최초 생성 시).
 * - 원장(JiraIssueLink) 업서트: 재가져오기 = 동기화.
 *   · 링크+Task 존재 → JIRA 최신값으로 갱신(제목/설명/상태→블록).
 *   · 링크 있으나 Task 삭제됨(고아) → 링크 제거 후 재생성.
 *   · 링크 없음 → 신규 생성.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraImportService {

    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 50;
    private static final String DEFAULT_TAG_COLOR = "#94a3b8";

    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraIssueMapper mapper;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
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
        String token = oauthService.resolveToken(config);
        JiraAuthContext ctx = JiraAuthContext.of(config, token);
        String jql = resolveJql(request, config);

        List<ParsedJiraIssue> issues;
        try {
            issues = fetchAll(ctx, jql);
        } catch (BusinessException e) {
            config.markError(e.getMessage());
            throw e;
        }

        if (request.isPreview()) {
            return buildPreview(boardId, issues, config);
        }

        Board board = boardRepository.findByIdWithLock(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User importer = userRepository.findById(userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Map<String, String> statusToBlock = readMap(config.getStatusToBlockJson());
        Map<String, String> priorityToTag = readMap(config.getPriorityToTagJson());
        Map<String, String> componentToTag = readMap(config.getComponentToTagJson());
        BlockStatusMap blockMap = BlockStatusMap.parse(objectMapper, config.getBlockStatusMapJson());
        MirrorColumns mirror = MirrorColumns.parse(objectMapper, config.getMirrorColumnsJson());

        Milestone currentMilestone = Boolean.TRUE.equals(config.getMilestoneAutoAssign())
            ? resolveCurrentMilestone(boardId) : null;
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
            .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // 에픽은 그룹핑에 쓰지 않으므로 제외 (프로젝트 Space = Feature)
        List<ParsedJiraIssue> importable = issues.stream()
            .filter(i -> !i.isEpic())
            .toList();

        // 원장 재조정(reconcile): BRIDGE에서 대상(Task/Feature)이 삭제된 고아 링크는 제거해
        // 재가져오기 시 다시 생성되게 한다. 살아있는 링크만 맵으로 구성한다.
        List<JiraIssueLink> existing = issueLinkRepository.findByBoardId(boardId);
        Map<String, JiraIssueLink> taskLinkByKey = new HashMap<>();
        Map<String, String> projectKeyToFeatureId = new HashMap<>();
        List<JiraIssueLink> orphans = new ArrayList<>();
        for (JiraIssueLink link : existing) {
            boolean targetAlive = link.getTargetType() == JiraLinkTargetType.TASK
                ? taskRepository.existsById(link.getTargetId())
                : featureRepository.existsById(link.getTargetId());
            if (!targetAlive) {
                orphans.add(link);
                continue;
            }
            if (link.getTargetType() == JiraLinkTargetType.TASK) {
                taskLinkByKey.put(link.getJiraIssueKey(), link);
            } else {
                projectKeyToFeatureId.put(link.getJiraIssueKey(), link.getTargetId());
            }
        }
        if (!orphans.isEmpty()) {
            issueLinkRepository.deleteAll(orphans);
            // DELETE를 즉시 반영 — flush가 없으면 Hibernate 기본 액션 순서(INSERT→DELETE)로 인해
            // 같은 (board_id, jira_issue_key)의 신규 saveLink INSERT가 고아 DELETE보다 먼저 실행되어
            // uq_jira_link_board_key 중복키 위반(500)이 난다. deleteAll 직후 강제 flush로 방지.
            issueLinkRepository.flush();
            log.info("JIRA reconcile board {}: {} orphan link(s) removed (BRIDGE에서 삭제됨)", boardId, orphans.size());
        }

        Counters c = new Counters();

        // ── 업서트: 이미 연동된 이슈는 갱신, 없으면(또는 삭제 후) 생성 ──
        for (ParsedJiraIssue issue : importable) {
            JiraIssueLink taskLink = taskLinkByKey.get(issue.key());
            if (taskLink != null) {
                // 대상 Task가 살아있음 → JIRA 최신값으로 갱신(제목/설명/상태→블록)
                Task existingTask = taskRepository.findById(taskLink.getTargetId()).orElse(null);
                if (existingTask != null) {
                    updateTaskFromIssue(existingTask, board, importer, issue, blockMap, mirror, statusToBlock, taskBlock, ctx, taskLink);
                    taskLink.touchImport(JiraLinkTargetType.TASK, existingTask.getId(), issue.updated());
                    c.updated++;
                    continue;
                }
            }

            // 신규 생성 (또는 삭제 후 재생성)
            Feature feature = resolveProjectFeature(board, importer, issue, projectKeyToFeatureId, c);
            Task task = createTask(board, importer, feature, issue, blockMap, mirror, statusToBlock, taskBlock, currentMilestone);
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
                    importAttachmentAsComment(board, importer, task, att, ctx);
                    c.comments++;
                } catch (Exception ex) {
                    log.warn("JIRA attachment import failed ({} / {}): {}", issue.key(), att.filename(), ex.getMessage());
                    c.errors.add(issue.key() + " 첨부 '" + att.filename() + "' 실패");
                }
            }
        }

        config.markSynced();
        log.info("JIRA import to board {}: created={} updated={} orphans={} (F{} T{} CL{} C{})",
            boardId, c.created, c.updated, orphans.size(), c.features, c.tasks, c.checklists, c.comments);

        return JiraResponse.ImportResult.builder()
            .total(importable.size()).created(c.created).updated(c.updated).skipped(0)
            .features(c.features).tasks(c.tasks).checklists(c.checklists).comments(c.comments)
            .errors(c.errors).build();
    }

    /**
     * 단건 pull (Phase 4 웹훅) — 이미 연동된 이슈 1건을 JIRA 최신값으로 동기화한다.
     * 미연동/에픽/삭제된 카드는 무시(신규 이슈는 스케줄러 full import가 담당).
     * updatedAt 충돌 규칙: JIRA가 원장보다 최신일 때만 반영. 변경된 Task를 반환(없으면 null).
     */
    /** 단건 pull 결과 스냅샷 — 트랜잭션 밖(웹훅 브로드캐스트)에서 안전하게 쓰도록 값만 담는다. */
    public record PulledTask(String taskId, String blockId, String blockName,
                             Integer position, boolean completed, String qaState) {}

    @Transactional
    public PulledTask syncSingleIssue(String boardId, String actorUserId, String issueKey) {
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId).orElse(null);
        if (config == null) return null;

        JiraIssueLink link = issueLinkRepository.findByBoardIdAndJiraIssueKey(boardId, issueKey).orElse(null);
        if (link == null || link.getTargetType() != JiraLinkTargetType.TASK) return null;
        Task task = taskRepository.findById(link.getTargetId()).orElse(null);
        if (task == null) return null;

        String token = oauthService.resolveToken(config);
        JiraAuthContext ctx = JiraAuthContext.of(config, token);
        ParsedJiraIssue issue = mapper.parse(jiraApiClient.getIssue(ctx, issueKey));
        if (issue.key() == null) return null;

        // 충돌 해소: JIRA가 우리 원장보다 최신일 때만 pull (오래된/에코 이벤트 무시)
        if (!link.isStaleAgainst(issue.updated())) return null;

        Board board = task.getBoard();
        User importer = userRepository.findById(actorUserId).orElse(task.getCreatedBy());
        Map<String, String> statusToBlock = readMap(config.getStatusToBlockJson());
        BlockStatusMap blockMap = BlockStatusMap.parse(objectMapper, config.getBlockStatusMapJson());
        MirrorColumns mirror = MirrorColumns.parse(objectMapper, config.getMirrorColumnsJson());
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK).orElse(null);

        updateTaskFromIssue(task, board, importer, issue, blockMap, mirror, statusToBlock, taskBlock, ctx, link);
        link.touchImport(JiraLinkTargetType.TASK, task.getId(), issue.updated());
        config.markSynced();

        return new PulledTask(task.getId(),
            task.getBlock() != null ? task.getBlock().getId() : null,
            task.getBlock() != null ? task.getBlock().getName() : null,
            task.getPosition(),
            Boolean.TRUE.equals(task.getIsCompleted()),
            task.getQaState() != null ? task.getQaState().name() : null);
    }

    /**
     * 기존 Task를 JIRA 이슈 최신값으로 갱신(동기화 = pull). 재가져오기/폴링이 동기화 역할을 한다.
     * 제목·설명은 항상 JIRA에서 갱신. 블록/QA 상태는 소유권에 따라:
     *  · 블록↔status 매핑이 있으면 <b>pull 전용</b>(검토중/완료/반려)만 카드를 옮긴다 — 개발 소유 위치는 보존.
     *  · 매핑이 없으면(레거시) 기존 statusName→block 단방향 동작.
     */
    private void updateTaskFromIssue(Task task, Board board, User importer, ParsedJiraIssue issue,
                                     BlockStatusMap blockMap, MirrorColumns mirrorCols, Map<String, String> statusToBlock,
                                     Block taskBlock, JiraAuthContext ctx, JiraIssueLink link) {
        task.updateInfo(truncate(issue.summary(), 200), issue.description(),
            task.getStartDate(), task.getDueDate(), task.getEstimatedMinutes());

        // 미러 모드: 상태=위치. 대응 미러 컬럼으로 이동, QA/반려 로직 없음.
        Block mirror = resolveMirrorBlock(board.getId(), issue.statusId(), mirrorCols);
        if (mirror != null) {
            moveTaskToBlockEnd(task, mirror);
        } else if (!blockMap.isEmpty()) {
            applyPullReflection(task, board, importer, issue, blockMap, ctx, link.getLastJiraStatusId());
        } else {
            moveTaskToBlockEnd(task, resolveBlock(board.getId(), issue.statusName(), statusToBlock, taskBlock));
        }
        link.markJiraStatus(issue.statusId());   // 다음 전환 감지용 직전 status 기록
    }

    /**
     * JIRA status 변화를 카드에 pull 반영 (읽기전용 소유권 존중).
     *  · 반려(검토중→개발블록 전환) → 복귀 블록 이동 + REJECTED + 사유 댓글. 전환 순간 1회만 발생.
     *  · pull status(검토중/완료) → 매핑 블록 유지 + qa_state(QA가 위치 소유).
     *  · push/미매핑 status(개발 소유) → 카드 위치 그대로, QA 흐름 밖이면 뱃지 해제.
     *
     * @param prevStatusId 직전 pull 때의 JIRA status(없으면 null) — 반려 전환 판정 기준
     */
    private void applyPullReflection(Task task, Board board, User importer, ParsedJiraIssue issue,
                                     BlockStatusMap blockMap, JiraAuthContext ctx, String prevStatusId) {
        // 반려 감지: 검토중(from)에 있다가 개발 소유 status로 되돌아온 전환
        BlockStatusMap.RejectionRule rule = blockMap.rejectionRule();
        if (rule != null && rule.fromStatusId().equals(prevStatusId)
                && blockMap.pullFor(issue.statusId()) == null) {
            moveToPullBlock(task, board, rule.returnBlockId());
            task.applyQaState(com.kanban.domain.task.QaState.REJECTED);
            pullRejectionReason(task, board, importer, issue, ctx);
            return;
        }

        BlockStatusMap.PullTarget pull = blockMap.pullFor(issue.statusId());
        if (pull == null) {
            if (task.getQaState() != null) task.applyQaState(null);  // 개발이 되가져감 → 뱃지 해제
            return;
        }
        // 검토중/완료는 QA가 위치를 소유 → 매핑 블록으로 유지 + 뱃지 반영.
        moveToPullBlock(task, board, pull.blockId());
        task.applyQaState(pull.qaState());
    }

    private void moveToPullBlock(Task task, Board board, String blockId) {
        Block target = blockRepository.findById(blockId).orElse(null);
        if (target != null && target.getBoard() != null && board.getId().equals(target.getBoard().getId())) {
            moveTaskToBlockEnd(task, target);
        }
    }

    private void moveTaskToBlockEnd(Task task, Block target) {
        if (target != null && (task.getBlock() == null || !target.getId().equals(task.getBlock().getId()))) {
            task.moveToBlock(target);
            Integer maxPos = taskRepository.findMaxPositionByBlockId(target.getId());
            task.updatePosition(maxPos != null ? maxPos + 1 : 0);
        }
    }

    /** 반려 시 JIRA 최신 댓글을 사유로 pull해 BRIDGE 댓글로 남긴다. 실패는 무시(반려 반영 자체는 유지). */
    private void pullRejectionReason(Task task, Board board, User importer, ParsedJiraIssue issue, JiraAuthContext ctx) {
        try {
            JsonNode full = jiraApiClient.getIssue(ctx, issue.key());
            JsonNode comments = full.path("fields").path("comment").path("comments");
            String reason = null;
            if (comments.isArray() && comments.size() > 0) {
                reason = JiraAdfConverter.toPlainText(comments.get(comments.size() - 1).path("body"));
            }
            String content = "↩ JIRA에서 반려되었습니다" + (reason != null ? "\n\n" + reason : "");
            commentRepository.save(Comment.builder()
                .task(task).board(board).author(importer).content(truncate(content, 1000)).build());
        } catch (Exception e) {
            log.warn("JIRA rejection reason pull failed for {}: {}", issue.key(), e.getMessage());
        }
    }

    // ── 미리보기 (읽기 전용 드라이런: DB 변경 없음) ──

    /**
     * 가져오기 전에 "이슈 1건 → BRIDGE에서 무엇이 되는지"를 계산한다.
     * 실제 생성/매핑 저장 없이 상태 블록·담당자 매칭·스킵 여부만 판별한다.
     */
    private JiraResponse.ImportResult buildPreview(String boardId, List<ParsedJiraIssue> issues,
                                                   JiraIntegrationConfig config) {
        // 살아있는 링크만: TASK 대상이 존재하는 이슈 키(→갱신 예정), FEATURE 대상이 존재하는 프로젝트 키
        Set<String> liveTaskKeys = new HashSet<>();
        Set<String> liveFeatureProjectKeys = new HashSet<>();
        for (JiraIssueLink link : issueLinkRepository.findByBoardId(boardId)) {
            if (link.getTargetType() == JiraLinkTargetType.TASK) {
                if (taskRepository.existsById(link.getTargetId())) liveTaskKeys.add(link.getJiraIssueKey());
            } else if (featureRepository.existsById(link.getTargetId())) {
                liveFeatureProjectKeys.add(link.getJiraIssueKey());
            }
        }
        Map<String, String> statusToBlock = readMap(config.getStatusToBlockJson());
        BlockStatusMap blockMap = BlockStatusMap.parse(objectMapper, config.getBlockStatusMapJson());
        MirrorColumns mirror = MirrorColumns.parse(objectMapper, config.getMirrorColumnsJson());
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK).orElse(null);
        Milestone currentMilestone = Boolean.TRUE.equals(config.getMilestoneAutoAssign())
            ? resolveCurrentMilestone(boardId) : null;

        List<JiraResponse.PreviewItem> items = new ArrayList<>();
        int tasks = 0, updated = 0, checklists = 0, attachments = 0;
        Set<String> newFeatureProjectKeys = new LinkedHashSet<>();  // 새로 생성될 Feature(프로젝트) 수

        for (ParsedJiraIssue issue : issues) {
            if (issue.isEpic()) continue;   // 에픽은 가져오지 않음 (프로젝트가 Feature)

            boolean willUpdate = liveTaskKeys.contains(issue.key());  // 기존 Task 갱신 예정
            boolean hasAssignee = issue.assigneeAccountId() != null;
            int attCount = issue.attachments() != null ? issue.attachments().size() : 0;

            Block block = resolvePlacementBlock(boardId, issue, blockMap, mirror, statusToBlock, taskBlock);
            String blockName = block != null ? block.getName() : null;

            if (willUpdate) {
                updated++;
            } else {
                tasks++;
                if (hasAssignee) checklists++;
                attachments += attCount;
                if (issue.projectKey() != null && !liveFeatureProjectKeys.contains(issue.projectKey())) {
                    newFeatureProjectKeys.add(issue.projectKey());
                }
            }

            items.add(JiraResponse.PreviewItem.builder()
                .key(issue.key())
                .summary(issue.summary())
                .targetType("TASK")
                .blockName(blockName)
                .assigneeName(issue.assigneeDisplayName())
                .assigneeMatched(hasAssignee && previewAssigneeMatched(
                    boardId, members, issue.assigneeAccountId(), issue.assigneeDisplayName()))
                .parentKey(issue.parentKey())
                .attachmentCount(attCount)
                .skipped(false)
                .skipReason(null)
                .willUpdate(willUpdate)
                .build());
        }

        return JiraResponse.ImportResult.builder()
            .total(items.size()).created(0).updated(updated).skipped(0)
            .features(newFeatureProjectKeys.size()).tasks(tasks).checklists(checklists).comments(attachments)
            .milestoneName(currentMilestone != null ? currentMilestone.getTitle() : null)
            .items(items).errors(List.of()).build();
    }

    /** resolveAssignee의 읽기 전용 버전 — 매핑 저장 없이 매칭 여부만 반환. */
    private boolean previewAssigneeMatched(String boardId, List<BoardMember> members,
                                           String accountId, String displayName) {
        Optional<JiraUserMapping> stored = userMappingRepository.findByBoardIdAndJiraAccountId(boardId, accountId);
        if (stored.isPresent()) return stored.get().getBridgeUser() != null;
        if (displayName == null) return false;
        return members.stream()
            .map(BoardMember::getUser)
            .anyMatch(u -> u != null && displayName.equalsIgnoreCase(u.getName()));
    }

    // ── fetch ─────────────────────────────────────

    private List<ParsedJiraIssue> fetchAll(JiraAuthContext ctx, String jql) {
        List<ParsedJiraIssue> out = new ArrayList<>();
        String nextPageToken = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            JsonNode result = jiraApiClient.searchIssues(ctx, jql, nextPageToken, PAGE_SIZE);
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

    /** 프로젝트(Space) 단위 Feature 확보 — 이미 있으면 재사용, 없으면 생성 후 원장 기록. */
    private Feature resolveProjectFeature(Board board, User importer, ParsedJiraIssue issue,
                                          Map<String, String> projectKeyToFeatureId, Counters c) {
        String projectKey = issue.projectKey() != null ? issue.projectKey() : "JIRA";
        String existingId = projectKeyToFeatureId.get(projectKey);
        if (existingId != null) {
            Feature found = featureRepository.findById(existingId).orElse(null);
            if (found != null) return found;
        }
        String name = issue.projectName() != null && !issue.projectName().isBlank()
            ? issue.projectName() : projectKey;
        Feature feature = createProjectFeature(board, importer, name);
        // 프로젝트키를 원장에 기록 → 재가져오기 때 같은 Feature 재사용
        issueLinkRepository.save(JiraIssueLink.builder()
            .board(board)
            .jiraIssueKey(projectKey)
            .targetType(JiraLinkTargetType.FEATURE)
            .targetId(feature.getId())
            .build());
        projectKeyToFeatureId.put(projectKey, feature.getId());
        c.features++;
        return feature;
    }

    private Feature createProjectFeature(Board board, User importer, String name) {
        Integer maxPos = featureRepository.findMaxPositionByBoardId(board.getId());
        Feature feature = Feature.builder()
            .board(board)
            .title(truncate(name, 200))
            .description("JIRA에서 가져온 이슈")
            .createdBy(importer)
            .position(maxPos != null ? maxPos + 1 : 0)
            .build();
        return featureRepository.save(feature);
    }

    private Task createTask(Board board, User importer, Feature feature, ParsedJiraIssue issue,
                            BlockStatusMap blockMap, MirrorColumns mirrorCols, Map<String, String> statusToBlock,
                            Block taskBlock, Milestone milestone) {
        Block block = resolvePlacementBlock(board.getId(), issue, blockMap, mirrorCols, statusToBlock, taskBlock);

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
        // 신규 이슈가 pull/반려 status로 들어오면 QA 뱃지도 함께 반영
        if (!blockMap.isEmpty()) {
            BlockStatusMap.PullTarget pull = blockMap.pullFor(issue.statusId());
            if (pull != null) task.applyQaState(pull.qaState());
        }

        taskRepository.save(task);
        feature.incrementTotalTasks();
        return task;
    }

    /** 신규 배치 블록 — 매핑이 있으면 status→block(방향 무관), 없으면 레거시 statusName 매핑, 최후엔 기본 블록. */
    /** 미러 컬럼 리졸브 — 이슈 상태가 속한 컬럼의 블록(보드 소속 검증). 없으면 null. */
    private Block resolveMirrorBlock(String boardId, String statusId, MirrorColumns mirrorCols) {
        if (mirrorCols == null || mirrorCols.isEmpty()) return null;
        String blockId = mirrorCols.blockForStatus(statusId);
        if (blockId == null) return null;
        Block b = blockRepository.findById(blockId).orElse(null);
        return (b != null && b.getBoard() != null && boardId.equals(b.getBoard().getId())) ? b : null;
    }

    private Block resolvePlacementBlock(String boardId, ParsedJiraIssue issue, BlockStatusMap blockMap,
                                        MirrorColumns mirrorCols, Map<String, String> statusToBlock, Block defaultBlock) {
        // 미러 모드: 상태가 속한 컬럼이 있으면 그리로. (미러 컬럼은 미러 보드에만 존재)
        Block mirror = resolveMirrorBlock(boardId, issue.statusId(), mirrorCols);
        if (mirror != null) return mirror;
        if (!blockMap.isEmpty()) {
            String blockId = blockMap.blockForStatusId(issue.statusId());
            if (blockId != null) {
                Block b = blockRepository.findById(blockId).orElse(null);
                if (b != null && b.getBoard() != null && boardId.equals(b.getBoard().getId())) return b;
            }
        }
        return resolveBlock(boardId, issue.statusName(), statusToBlock, defaultBlock);
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
                                           ParsedJiraIssue.Attachment att, JiraAuthContext ctx) {
        byte[] data = jiraApiClient.downloadAttachment(ctx, att.contentUrl());

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
            .lastJiraStatusId(issue.statusId())
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
        int created, updated, features, tasks, checklists, comments;
        final List<String> errors = new ArrayList<>();
    }
}
