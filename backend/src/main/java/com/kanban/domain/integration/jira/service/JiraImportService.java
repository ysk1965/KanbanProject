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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

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
 *   · JIRA에서 이슈가 삭제됨 → 링크에 삭제 표시(soft-unlink), Task는 보존.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraImportService {

    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 50;
    private static final String DEFAULT_TAG_COLOR = "#94a3b8";
    /** 한 번의 import에서 "삭제 여부"를 JIRA에 확인할 최대 이슈 수 — 폴링(2분)이 API를 때리지 않도록 제한. */
    private static final int MAX_DELETION_PROBES = 20;
    /** 한 번의 import에서 댓글을 대조할 최대 이슈 수 — 이슈당 코멘트 조회 1콜이 추가되므로 제한. */
    private static final int MAX_COMMENT_RECONCILES = 15;
    /**
     * 한 번의 import에서 이슈 메타를 소급해 채울 최대 건수.
     * JIRA가 안 바뀐 이슈까지 담당자·태그를 뒤지는 경로라, 첫 배포 직후 한 주기가 보드 전체를
     * 훑지 않도록 묶는다. 남은 카드는 다음 주기에 이어서 채워진다.
     */
    private static final int MAX_META_BACKFILLS = 40;

    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraCommentSyncService commentSyncService;
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
        SyncMaps syncMaps = new SyncMaps(blockMap, mirror, statusToBlock, taskBlock,
            members, priorityToTag, componentToTag);

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
        // 댓글 대조 대상 — JIRA 쪽이 갱신됐거나 새로 만든 이슈. 코멘트 추가/삭제도 issue.updated를 올리므로
        // 이 조건이면 웹훅을 놓친 댓글 변경까지 함께 잡힌다.
        List<String> commentReconcileKeys = new ArrayList<>();
        boolean commentSyncOn = config.isCommentSyncEnabled();
        int metaBackfills = 0;

        // ── 업서트: 이미 연동된 이슈는 갱신, 없으면(또는 삭제 후) 생성 ──
        for (ParsedJiraIssue issue : importable) {
            JiraIssueLink taskLink = taskLinkByKey.get(issue.key());
            if (taskLink != null) {
                // 대상 Task가 살아있음 → JIRA 최신값으로 갱신(제목/설명/상태→블록)
                Task existingTask = taskRepository.findById(taskLink.getTargetId()).orElse(null);
                if (existingTask != null) {
                    boolean stale = taskLink.isStaleAgainst(issue.updated());
                    boolean batched = stale && commentSyncOn
                        && commentReconcileKeys.size() < MAX_COMMENT_RECONCILES;
                    if (batched) commentReconcileKeys.add(issue.key());

                    // 대조 배치에서 밀린 이슈는 워터마크를 올리지 않는다 — 올려버리면 다음 주기에 stale이
                    // 아니게 되어 그 이슈의 댓글은 영영 대조되지 않는다("다음 주기에 이어서 처리"가 성립하려면
                    // stale 상태로 남아 있어야 한다). Task 본문 갱신은 이미 끝났으므로 재처리해도 멱등.
                    boolean hold = commentSyncOn && stale && !batched;

                    // 삭제 표시된 키가 다시 조회됨(복구/재생성) → 연동 복구
                    if (taskLink.isJiraDeleted()) {
                        taskLink.clearJiraDeleted();
                        log.info("JIRA reconcile board {}: {} 재등장 → 연동 복구", boardId, issue.key());
                    }
                    // JIRA가 안 바뀐 이슈라도 메타를 한 번도 기록한 적 없으면(이 기능 이전에 링크된 카드)
                    // 이번에 채운다. 다만 253건짜리 보드가 배포 직후 첫 폴링 한 번에 전량을 훑으면
                    // 트랜잭션 하나가 수백 번 질의한다 — 주기당 상한을 걸어 몇 바퀴에 나눠 채운다.
                    boolean backfillMeta = !stale && taskLink.needsIssueMetaBackfill()
                        && metaBackfills < MAX_META_BACKFILLS;
                    if (backfillMeta) metaBackfills++;
                    updateTaskFromIssue(existingTask, board, importer, issue, syncMaps, ctx, taskLink,
                        stale || backfillMeta);

                    // 첨부는 신규 생성 때만 가져오고 있었다. QA가 이슈를 올린 뒤 댓글로 스크린샷을
                    // 덧붙이는 것이 오히려 흔한데, 그 그림들이 BRIDGE에 영영 들어오지 않았다.
                    // 이슈가 바뀐 주기에만 본다 — 첨부가 늘면 updated도 함께 움직인다.
                    if (stale) reconcileAttachments(board, importer, existingTask, issue, ctx, c);
                    taskLink.touchImport(JiraLinkTargetType.TASK, existingTask.getId(),
                        hold ? taskLink.getJiraUpdatedAt() : issue.updated());
                    c.updated++;
                    continue;
                }
            }

            // 신규 생성 (또는 삭제 후 재생성)
            Feature feature = resolveProjectFeature(board, importer, issue, projectKeyToFeatureId, c);
            Task task = createTask(board, importer, feature, issue, blockMap, mirror, statusToBlock, taskBlock, currentMilestone);
            // 신규 이슈도 대조 배치 상한을 함께 쓴다. 밀렸으면 워터마크를 비워 다음 주기에 stale로 잡히게 한다.
            boolean batchedNew = commentSyncOn && commentReconcileKeys.size() < MAX_COMMENT_RECONCILES;
            if (batchedNew) commentReconcileKeys.add(issue.key());
            JiraIssueLink newLink = saveLink(board, issue, JiraLinkTargetType.TASK, task.getId(),
                commentSyncOn && !batchedNew ? null : issue.updated());
            c.tasks++;
            c.created++;

            // 담당자 → ChecklistItem
            User assignee = resolveAssignee(board, members, issue.assigneeAccountId(), issue.assigneeDisplayName());
            if (assignee != null) {
                createAssigneeChecklist(task, newLink, assignee, issue.assigneeDisplayName());
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

        // JIRA 쪽 삭제 반영: 이번 조회에 없는 링크를 실제 삭제인지 확인해 soft-unlink.
        int deleted = reconcileDeletedInJira(boardId, ctx, taskLinkByKey, importable);

        // 댓글 대조 (웹훅 유실 백업). 링크 원장이 에코를 막으므로 몇 번을 돌려도 중복 생성되지 않는다.
        reconcileComments(boardId, commentReconcileKeys);

        config.markSynced();
        log.info("JIRA import to board {}: created={} updated={} orphans={} jiraDeleted={} (F{} T{} CL{} C{})",
            boardId, c.created, c.updated, orphans.size(), deleted, c.features, c.tasks, c.checklists, c.comments);

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
        if (link.isJiraDeleted()) return null;   // JIRA에서 삭제된 이슈 — 연동 해제 상태
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
        SyncMaps maps = new SyncMaps(blockMap, mirror, statusToBlock, taskBlock,
            boardMemberRepository.findByBoardId(boardId),
            readMap(config.getPriorityToTagJson()), readMap(config.getComponentToTagJson()));

        // 여기까지 온 것 자체가 "JIRA가 원장보다 최신"이라는 판정을 통과했다는 뜻 → 소유 필드도 함께 맞춘다.
        updateTaskFromIssue(task, board, importer, issue, maps, ctx, link, true);
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
     * JIRA 이슈 삭제 반영 (웹훅 {@code jira:issue_deleted} 즉시 경로).
     * 링크에 삭제 표시만 남기고 Task는 보존한다 — BRIDGE 쪽 체크리스트/댓글/작업 이력을 잃지 않도록.
     * 브로드캐스트용 taskId 반환(대상 없음/이미 처리됨이면 null).
     */
    @Transactional
    public String markIssueDeleted(String boardId, String issueKey) {
        if (configRepository.findActiveByBoardId(boardId).isEmpty()) return null;

        JiraIssueLink link = issueLinkRepository.findByBoardIdAndJiraIssueKey(boardId, issueKey).orElse(null);
        if (link == null || link.getTargetType() != JiraLinkTargetType.TASK) return null;
        if (link.isJiraDeleted()) return null;   // 멱등 — 중복 웹훅 무시

        link.markJiraDeleted();
        log.info("JIRA issue deleted: board {} issue {} → task {} 연동 해제", boardId, issueKey, link.getTargetId());
        return link.getTargetId();
    }

    /**
     * 댓글 대조(웹훅 백업) — JIRA가 갱신된 이슈만 코멘트 목록을 확인해 누락된 생성/삭제를 보충한다.
     *
     * <p>이슈당 코멘트 조회 1콜이 붙으므로 한 주기 처리량을 {@link #MAX_COMMENT_RECONCILES}로 묶는다.
     * 상한은 호출 측 루프에서 걸고, 밀린 이슈는 워터마크를 올리지 않아 다음 주기에 다시 stale로 잡힌다.
     */
    private void reconcileComments(String boardId, List<String> issueKeys) {
        for (String key : issueKeys) {
            try {
                commentSyncService.reconcileIssue(boardId, key);
            } catch (Exception e) {
                log.warn("JIRA comment reconcile failed for {}: {}", key, e.getMessage());
            }
        }
    }

    /**
     * JIRA 쪽 삭제 재조정 — 원장에는 있는데 이번 JQL 결과에 없는 이슈를 soft-unlink 한다.
     *
     * <p><b>결과에 없다 ≠ 삭제됨.</b> status 변경·프로젝트 이동·JQL 범위 축소로도 빠지므로,
     * 후보마다 단건 조회해 <b>404(JIRA_ISSUE_NOT_FOUND)인 것만</b> 삭제로 판정한다.
     * 그 외 오류(권한/네트워크)는 건드리지 않고 다음 주기로 미룬다.
     *
     * <p>2분 폴링이 JIRA API를 때리지 않도록 한 주기 확인 수를 {@link #MAX_DELETION_PROBES}로 제한한다.
     * 남은 후보는 다음 주기에 이어서 처리된다(이슈키 정렬로 순서 고정).
     *
     * @return 이번에 삭제로 표시한 링크 수
     */
    private int reconcileDeletedInJira(String boardId, JiraAuthContext ctx,
                                       Map<String, JiraIssueLink> taskLinkByKey,
                                       List<ParsedJiraIssue> fetched) {
        if (taskLinkByKey.isEmpty()) return 0;

        Set<String> fetchedKeys = fetched.stream().map(ParsedJiraIssue::key).collect(Collectors.toSet());
        List<String> candidates = taskLinkByKey.entrySet().stream()
            .filter(e -> !fetchedKeys.contains(e.getKey()))
            .filter(e -> !e.getValue().isJiraDeleted())
            .map(Map.Entry::getKey)
            .sorted()
            .toList();
        if (candidates.isEmpty()) return 0;

        int probed = 0, deleted = 0;
        for (String key : candidates) {
            if (probed >= MAX_DELETION_PROBES) {
                log.info("JIRA reconcile board {}: 삭제 확인 {}건 남음 — 다음 주기에 이어서 처리", boardId, candidates.size() - probed);
                break;
            }
            probed++;
            try {
                jiraApiClient.getIssue(ctx, key);
            } catch (BusinessException e) {
                if (e.getErrorCode() == ErrorCode.JIRA_ISSUE_NOT_FOUND) {
                    taskLinkByKey.get(key).markJiraDeleted();
                    deleted++;
                    log.info("JIRA reconcile board {}: {} JIRA에서 삭제됨 → 연동 해제", boardId, key);
                }
                // 그 외(권한/일시 오류)는 판정 보류
            } catch (Exception e) {
                log.warn("JIRA 삭제 확인 실패 ({}): {}", key, e.getMessage());
            }
        }
        return deleted;
    }

    /**
     * 한 번의 동기화 동안 고정인 매핑 묶음. 이슈마다 다시 읽지 않도록 모아 둔다.
     * (인자를 열 개 넘게 늘어놓지 않으려는 목적도 겸한다)
     */
    private record SyncMaps(BlockStatusMap blockMap, MirrorColumns mirrorCols,
                            Map<String, String> statusToBlock, Block taskBlock,
                            List<BoardMember> members,
                            Map<String, String> priorityToTag, Map<String, String> componentToTag) {}

    /**
     * 기존 Task를 JIRA 이슈 최신값으로 갱신(동기화 = pull). 재가져오기/폴링이 동기화 역할을 한다.
     * 제목·설명은 항상 JIRA에서 갱신. 블록/QA 상태는 소유권에 따라:
     *  · 블록↔status 매핑이 있으면 <b>pull 전용</b>(검토중/완료/반려)만 카드를 옮긴다 — 개발 소유 위치는 보존.
     *  · 매핑이 없으면(레거시) 기존 statusName→block 단방향 동작.
     *
     * <p>우선순위·컴포넌트는 <b>JIRA 소유 필드</b>다 — 최초 생성 때 한 번 심고 마는 게 아니라
     * 여기서 계속 맞춘다. 그렇지 않으면 JIRA에서 값을 바꿔도 BRIDGE는 최초 값을 영원히 들고 있고,
     * 화면은 "몇 분 전 동기화됨"이라 말하고 있어 사용자가 그 값을 최신이라 믿는다.
     *
     * <p>담당자만은 <b>양쪽이 함께 쓰는 필드</b>라 규칙이 다르다 — {@link #syncAssignee} 참고.
     *
     * @param syncOwnedFields 우선순위·컴포넌트(태그)까지 맞출지. JIRA가 실제로 갱신된 이슈에만 켠다 —
     *                        2분 폴링마다 전 이슈의 태그를 뒤지면 조회 비용이 감당이 안 된다.
     *                        (판단은 호출 측이 한다. 메타 미기록 링크의 소급 채움도 거기서 함께 조절한다)
     *                        담당자는 이 게이트 밖이다 — 아래 호출부 주석 참고.
     */
    private void updateTaskFromIssue(Task task, Board board, User importer, ParsedJiraIssue issue,
                                     SyncMaps maps, JiraAuthContext ctx, JiraIssueLink link,
                                     boolean syncOwnedFields) {
        task.updateInfo(truncate(issue.summary(), 200), issue.description(),
            task.getStartDate(), task.getDueDate(), task.getEstimatedMinutes());

        // 미러 모드: 상태=위치. 대응 미러 컬럼으로 이동 후, QA 검토 중 → 할 일 역행이면 반려 처리.
        Block mirror = resolveMirrorBlock(board.getId(), issue.statusId(), maps.mirrorCols());
        if (mirror != null) {
            moveTaskToBlockEnd(task, mirror);
            applyMirrorRejection(task, board, importer, issue, maps.mirrorCols(), ctx, link.getLastJiraStatusId());
        } else if (!maps.blockMap().isEmpty()) {
            applyPullReflection(task, board, importer, issue, maps.blockMap(), ctx, link.getLastJiraStatusId());
        } else {
            moveTaskToBlockEnd(task, resolveBlock(board.getId(), issue.statusName(), maps.statusToBlock(), maps.taskBlock()));
        }
        link.markJiraStatus(issue.statusId());   // 다음 전환 감지용 직전 status 기록

        // 담당자는 소유 필드 게이트 밖이다. 게이트는 "조회 비용"을 묶으려는 장치인데, 담당자 동기화는
        // 기준선이 어긋나지 않는 한 질의 없이 즉시 빠져나온다(원장 UPDATE는 어차피 매 주기 일어난다).
        // 반대로 게이트 안에 두면 기준선이 늦게 잡혀, 그 사이 JIRA가 옮긴 담당자를 영영 놓친다.
        syncAssignee(task, board, maps.members(), issue, link);

        if (syncOwnedFields) {
            syncJiraTags(task, board, issue, link, maps.priorityToTag(), maps.componentToTag());
            // 태그를 반영한 바로 그 값으로 원장을 갱신한다 — 둘이 어긋나면 다음 주기에 낡은 태그가 남는다.
            link.applyIssueMeta(truncate(issue.issueTypeName(), 60),
                truncate(issue.priorityName(), 60), joinComponents(issue.componentNames()));
        }
    }

    /**
     * JIRA 담당자 → 담당자 체크리스트 항목 동기화.
     *
     * <p>담당자를 체크리스트로 이관하는 구조라 "어느 항목이 JIRA 것인가"를 알아야 한다.
     * 그 판정은 {@link JiraAssigneeChecklist}가 맡는다 — 원장 표식이 우선이고, 표식이 없는 옛 카드만
     * 제목 접두사로 찾는다.
     *
     * <p><b>담당자는 양쪽이 다 만지는 값이다.</b> JIRA에서도 넘기고, BRIDGE에서도 팀원에게 나눈다.
     * 그래서 "지금 값이 다르다"만 보고 pull이 이기게 두면, 보드에서 나눠 놓은 담당이 폴링 한 바퀴에
     * 통째로 JIRA 값으로 되돌아간다(실제로 그렇게 됐다). 판정 기준은 현재 값이 아니라
     * <b>직전 관측값 대비 JIRA가 움직였는가</b>다:
     *
     * <ul>
     *   <li>기준선 없음 → 이번엔 관측만 하고 카드는 건드리지 않는다. 기존 링크는 전부 여기로 들어와
     *       한 바퀴를 조용히 지나간다.</li>
     *   <li>JIRA가 움직임 → pull이 이긴다(아래 기존 규칙대로 반영).</li>
     *   <li>JIRA 그대로인데 BRIDGE가 다름 → 사람이 나눈 것. 손대지 않는다.</li>
     * </ul>
     *
     * <p>덮어쓰기 범위를 좁게 잡은 이유가 하나 더 있다. JIRA에 담당자가 있는데 BRIDGE 멤버로
     * 해석되지 않는 경우(매핑 없음·이름 불일치)까지 "pull이 이긴다"고 밀어붙이면,
     * 사람이 BRIDGE에서 지정해 둔 담당자가 매 주기 지워진다. 그래서 담당자를 비우는 것은
     * JIRA가 실제로 "미지정"이라고 말할 때뿐이고, 해석 실패는 이름만 갱신하고 넘어간다.
     *
     * <p>대가 하나: JIRA 담당자가 처음부터 BRIDGE 멤버로 해석되지 않아 항목이 안 만들어진 카드는,
     * 나중에 사용자 매핑을 이어 줘도 그 담당자가 JIRA에서 실제로 바뀌기 전까지는 항목이 생기지 않는다.
     * 지워 둔 항목을 되살리지 않으려면 "없음"과 "지웠음"을 구분하지 않는 수밖에 없고, 그렇다면
     * 되살리지 않는 쪽이 사람의 손을 존중한다.
     */
    private void syncAssignee(Task task, Board board, List<BoardMember> members, ParsedJiraIssue issue,
                              JiraIssueLink link) {
        String accountId = issue.assigneeAccountId();

        boolean baselineOnly = link.needsAssigneeBaseline();
        boolean jiraChanged = link.jiraAssigneeChanged(accountId);
        link.applyAssignee(accountId);
        if (baselineOnly || !jiraChanged) return;

        boolean unassignedInJira = accountId == null;
        User resolved = unassignedInJira
            ? null : resolveAssignee(board, members, accountId, issue.assigneeDisplayName());

        ChecklistItem owned = JiraAssigneeChecklist.findOwned(checklistItemRepository, task.getId(), link);

        if (owned == null) {
            // 해석되지 않는 담당자 하나 때문에 담당자 없는 빈 항목을 만들지는 않는다(생성 경로와 같은 규칙).
            if (resolved != null) createAssigneeChecklist(task, link, resolved, issue.assigneeDisplayName());
            return;
        }

        // 제목은 접두사가 남아 있을 때만 맞춘다. 사람이 이슈 제목으로 바꿔 쓰고 있는 항목을
        // 담당자가 바뀌었다고 "담당: OOO"으로 되돌리면, 팀이 붙여 둔 이름이 매번 사라진다.
        if (JiraAssigneeChecklist.hasPrefix(owned)) {
            owned.updateTitle(JiraAssigneeChecklist.titleFor(issue.assigneeDisplayName()));
        }
        if (resolved != null) {
            owned.updateAssignee(resolved);
        } else if (unassignedInJira) {
            owned.updateAssignee(null);
        }
    }

    /**
     * JIRA 우선순위·컴포넌트 → 태그 동기화.
     *
     * <p>회수 대상은 <b>원장에 적힌 직전 값</b>뿐이다. 이름이 비슷하다고 떼지 않는다 —
     * 사람이 BRIDGE에서 직접 붙인 태그를 JIRA 동기화가 뜯어가면 안 되기 때문이다.
     * 태그 자체(Tag 행)는 지우지 않고 Task와의 연결만 끊는다. 다른 카드가 쓰고 있을 수 있다.
     */
    private void syncJiraTags(Task task, Board board, ParsedJiraIssue issue, JiraIssueLink link,
                              Map<String, String> priorityToTag, Map<String, String> componentToTag) {
        // 이번 동기화 후에도 남아 있어야 할 태그. 매핑 설정(priority_to_tag/component_to_tag)에서
        // 서로 다른 JIRA 값이 같은 태그를 가리킬 수 있어, "떼기"는 반드시 이 집합을 피해서 한다.
        // 이 보호가 없으면 우선순위 High→Highest가 같은 태그로 매핑된 보드에서 태그가 사라진다.
        Set<String> keep = new HashSet<>();
        collectTagId(keep, board, issue.priorityName(), priorityToTag);
        for (String comp : issue.componentNames()) {
            collectTagId(keep, board, comp, componentToTag);
        }

        String prevPriority = link.getJiraPriority();
        String nextPriority = issue.priorityName();
        if (!Objects.equals(prevPriority, nextPriority)) {
            detachTag(task, board, prevPriority, priorityToTag, keep);
            applyTag(task, resolveTag(board, nextPriority, priorityToTag));
        }

        Set<String> prevComponents = splitComponents(link.getJiraComponentNames());
        Set<String> nextComponents = new LinkedHashSet<>(issue.componentNames());
        for (String gone : prevComponents) {
            if (!nextComponents.contains(gone)) detachTag(task, board, gone, componentToTag, keep);
        }
        for (String added : nextComponents) {
            if (!prevComponents.contains(added)) applyTag(task, resolveTag(board, added, componentToTag));
        }
    }

    /** 보존 대상 태그 id 수집. 아직 없는 태그는 뗄 수도 없으므로 생성하지 않고 지나간다. */
    private void collectTagId(Set<String> into, Board board, String jiraValue, Map<String, String> mapping) {
        Tag tag = findTag(board, jiraValue, mapping);
        if (tag != null) into.add(tag.getId());
    }

    /** JIRA가 심었던 태그를 카드에서 떼어낸다. 이미 없거나 아직 쓰이는 태그면 조용히 넘어간다. */
    private void detachTag(Task task, Board board, String jiraValue,
                           Map<String, String> mapping, Set<String> keep) {
        Tag tag = findTag(board, jiraValue, mapping);
        if (tag == null || keep.contains(tag.getId())) return;
        taskTagRepository.deleteByTaskIdAndTagId(task.getId(), tag.getId());
    }

    /**
     * {@link #resolveTag}의 비생성 버전. 회수하려는 태그를 찾는 자리에서 새 태그를 만들면,
     * 없어진 우선순위 이름으로 빈 태그가 계속 늘어난다.
     */
    private Tag findTag(Board board, String jiraValue, Map<String, String> mapping) {
        if (jiraValue == null || jiraValue.isBlank()) return null;
        if (mapping.containsKey(jiraValue)) {
            Tag mapped = tagRepository.findById(mapping.get(jiraValue)).orElse(null);
            if (mapped != null && mapped.getBoard() != null && board.getId().equals(mapped.getBoard().getId())) {
                return mapped;
            }
        }
        return tagRepository.findByBoardIdAndName(board.getId(), jiraValue).orElse(null);
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

    /**
     * 미러 모드 반려 감지(정밀). 직전 상태가 QA 검토 컬럼이었는데 현재가 '할 일'(statusCategory=new)로
     * 역행하면 반려로 본다. 카드는 이미 할 일 미러 컬럼으로 이동됐으므로 여기선 뱃지+사유 댓글만 붙인다.
     * 반대로 반려 뱃지 카드가 다시 앞으로 진행(할 일 밖)하면 뱃지를 해제한다.
     *
     * @param prevStatusId 직전 pull 때의 JIRA status(없으면 null)
     */
    private void applyMirrorRejection(Task task, Board board, User importer, ParsedJiraIssue issue,
                                      MirrorColumns mirrorCols, JiraAuthContext ctx, String prevStatusId) {
        boolean cameFromQaReview = prevStatusId != null
            && mirrorCols.qaReviewStatusIds().contains(prevStatusId);
        boolean nowTodo = "new".equalsIgnoreCase(issue.statusCategory());
        if (cameFromQaReview && nowTodo) {
            task.applyQaState(com.kanban.domain.task.QaState.REJECTED);
            pullRejectionReason(task, board, importer, issue, ctx);
        } else if (task.getQaState() == com.kanban.domain.task.QaState.REJECTED && !nowTodo) {
            task.applyQaState(null);   // 다시 앞으로 진행 → 반려 뱃지 해제
        }
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

    /** 담당자 항목 생성 + 원장에 소유권 표식. 표식을 함께 심어야 제목이 바뀌어도 이 항목을 계속 따라간다. */
    private void createAssigneeChecklist(Task task, JiraIssueLink link, User assignee, String displayName) {
        ChecklistItem item = ChecklistItem.builder()
            .task(task)
            .title(JiraAssigneeChecklist.titleFor(displayName))
            .assignee(assignee)
            .position(0)
            .build();
        checklistItemRepository.save(item);
        link.linkAssigneeItem(item.getId());
    }

    /**
     * 이미 있는 태스크에 새로 붙은 첨부만 가져온다.
     *
     * <p>같은 것을 다시 받지 않는 기준은 파일명+크기다. JIRA 첨부 id를 저장해 두지 않아서인데,
     * 같은 이슈에 같은 이름·같은 크기로 다른 그림이 올라오는 경우는 실질적으로 없다.
     *
     * <p>개별 실패는 삼킨다 — 그림 하나 못 받은 것이 이슈 동기화 전체를 세울 이유는 못 된다.
     */
    private void reconcileAttachments(Board board, User importer, Task task,
                                      ParsedJiraIssue issue, JiraAuthContext ctx, Counters c) {
        if (issue.attachments().isEmpty()) return;

        Set<String> existing = commentAttachmentRepository.findByTaskId(task.getId()).stream()
            .map(a -> a.getOriginalFileName() + " " + (a.getFileSize() != null ? a.getFileSize() : 0L))
            .collect(Collectors.toSet());

        for (ParsedJiraIssue.Attachment att : issue.attachments()) {
            if (existing.contains(att.filename() + " " + att.size())) continue;
            try {
                importAttachmentAsComment(board, importer, task, att, ctx);
                c.comments++;
                log.info("JIRA reconcile: {} 첨부 추가 수집 — {}", issue.key(), att.filename());
            } catch (Exception ex) {
                log.warn("JIRA attachment reconcile failed ({} / {}): {}",
                    issue.key(), att.filename(), ex.getMessage());
            }
        }
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

    /**
     * {@code jiraUpdatedAt}은 호출 측이 정한다 — 댓글 대조가 밀린 이슈는 null로 남겨 다음 주기에 다시 잡는다.
     *
     * <p>담당자 기준선은 여기서 바로 심는다. 이 경로로 만들어지는 카드는 담당자 항목도 같은
     * 트랜잭션에서 JIRA 값 그대로 만들어지므로, 기준선을 비워 두고 다음 주기에 관측시키면
     * 그 한 바퀴 동안 담당자 변경만 반영되지 않는 구멍이 생긴다.
     */
    private JiraIssueLink saveLink(Board board, ParsedJiraIssue issue, JiraLinkTargetType type, String targetId,
                                   LocalDateTime jiraUpdatedAt) {
        return issueLinkRepository.save(JiraIssueLink.builder()
            .board(board)
            .jiraIssueKey(issue.key())
            .jiraIssueId(issue.id())
            .targetType(type)
            .targetId(targetId)
            .jiraUpdatedAt(jiraUpdatedAt)
            .lastJiraStatusId(issue.statusId())
            .jiraIssueType(truncate(issue.issueTypeName(), 60))
            .jiraPriority(truncate(issue.priorityName(), 60))
            .jiraComponentNames(joinComponents(issue.componentNames()))
            .jiraAssigneeAccountId(issue.assigneeAccountId())
            .assigneeSyncedAt(LocalDateTime.now(ZoneOffset.UTC))
            .build());
    }

    /** 컴포넌트 이름들을 원장 보관용 한 줄로. 빈 목록은 null(= "심은 것 없음")로 둔다. */
    private String joinComponents(List<String> names) {
        if (names == null || names.isEmpty()) return null;
        return truncate(String.join(",", names), 500);
    }

    /** 원장에 보관된 컴포넌트 줄을 다시 집합으로. 순서는 보존한다(태그 부착 순서 안정). */
    private Set<String> splitComponents(String joined) {
        if (joined == null || joined.isBlank()) return Set.of();
        return Arrays.stream(joined.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toCollection(LinkedHashSet::new));
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
