package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.service.CommentService;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * BRIDGE 댓글 ↔ JIRA 코멘트 양방향 동기화 (v1: 생성 + 삭제).
 *
 * <p><b>에코 차단</b>은 전부 {@link JiraCommentLink} 원장 한 곳에서 한다 —
 * 링크가 이미 있는 댓글/코멘트는 반대편으로 다시 보내지 않는다. 인바운드 반영은
 * {@code CommentService}의 시스템 경로를 써서 도메인 이벤트를 내지 않으므로,
 * "받은 것을 되돌려 보내는" 루프 자체가 성립하지 않는다.
 *
 * <p><b>삭제의 비대칭</b>: BRIDGE→JIRA 삭제는 {@link JiraCommentOrigin#BRIDGE} 코멘트에만 수행한다.
 * JIRA 발 코멘트는 남이 쓴 글이라 삭제에 "Delete all comments" 프로젝트 권한이 필요한데
 * 보통 없기 때문. 그 경우 BRIDGE에서는 사라지고 JIRA 원본은 남는다(로컬 삭제).
 *
 * <p><b>경로</b>
 * <ul>
 *   <li>아웃바운드: {@code CommentService} 도메인 이벤트 → {@code JiraPushListener}(AFTER_COMMIT, 비동기)</li>
 *   <li>인바운드(실시간): JIRA 웹훅 {@code comment_created/deleted} → {@code JiraWebhookService}</li>
 *   <li>인바운드(백업): 폴링 import에서 JIRA가 갱신된 이슈만 {@link #reconcileIssue}로 대조</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraCommentSyncService {

    /** BRIDGE 댓글을 JIRA에 쓸 때 붙는 머리글 — JIRA 화면에서 출처를 구분하기 위함. */
    private static final String OUTBOUND_PREFIX = "💬 BRIDGE · ";
    /** JIRA 코멘트를 BRIDGE로 가져올 때, 작성자를 BRIDGE 멤버로 매칭하지 못한 경우의 머리글. */
    private static final String INBOUND_PREFIX = "💬 JIRA · ";
    private static final int MAX_CONTENT_LENGTH = 10000;

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraCommentLinkRepository commentLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final CommentRepository commentRepository;
    private final CommentService commentService;
    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final ObjectMapper objectMapper;

    // ── 아웃바운드: BRIDGE → JIRA ──────────────────

    /**
     * BRIDGE 댓글을 JIRA 코멘트로 작성. {@code JiraPushListener}가 커밋 후 비동기로 호출한다.
     * 미연동 카드/기능 off/이미 매핑된 댓글(=JIRA에서 온 것)이면 no-op.
     */
    @Transactional
    public void pushCreate(String boardId, String taskId, String commentId) {
        JiraIntegrationConfig config = activeCommentSyncConfig(boardId);
        if (config == null) return;
        if (commentLinkRepository.findByCommentId(commentId).isPresent()) return;   // 에코 차단

        JiraIssueLink issueLink = issueLinkRepository
            .findByTargetTypeAndTargetId(JiraLinkTargetType.TASK, taskId).orElse(null);
        if (issueLink == null || issueLink.isJiraDeleted()) return;   // JIRA 연동 카드 아님 / 원본 삭제됨

        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return;

        try {
            String token = oauthService.resolveToken(config);
            JsonNode created = jiraApiClient.addComment(JiraAuthContext.of(config, token),
                issueLink.getJiraIssueKey(), JiraAdfConverter.toAdf(objectMapper, formatOutbound(comment)));

            String jiraCommentId = created != null ? created.path("id").asText(null) : null;
            if (jiraCommentId == null) {
                log.warn("JIRA comment push: no id in response for {}", issueLink.getJiraIssueKey());
                return;
            }
            commentLinkRepository.save(JiraCommentLink.builder()
                .board(comment.getBoard())
                .commentId(commentId)
                .taskId(taskId)
                .jiraIssueKey(issueLink.getJiraIssueKey())
                .jiraCommentId(jiraCommentId)
                .origin(JiraCommentOrigin.BRIDGE)
                .build());
            log.info("JIRA comment push: comment {} → {} #{}", commentId, issueLink.getJiraIssueKey(), jiraCommentId);
        } catch (Exception e) {
            log.warn("JIRA comment push failed for {}: {}", issueLink.getJiraIssueKey(), e.getMessage());
            config.markError("댓글 전송 실패: " + issueLink.getJiraIssueKey());
        }
    }

    /**
     * BRIDGE에서 지워진 댓글을 JIRA에서도 삭제. 호출 시점에 BRIDGE 댓글 행은 이미 없다
     * (그래서 {@link JiraCommentLink}에 FK를 걸지 않는다).
     *
     * <p>JIRA 삭제 성공 여부와 무관하게 링크 행은 정리한다 — 가리키는 댓글이 사라졌으므로
     * 남겨두면 재조정이 "삭제된 원격 코멘트"로 오판할 여지만 남는다.
     */
    @Transactional
    public void pushDelete(String boardId, String commentId) {
        JiraCommentLink link = commentLinkRepository.findByCommentId(commentId).orElse(null);
        if (link == null) return;   // JIRA로 나간 적 없는 댓글

        if (link.isFromBridge()) {
            JiraIntegrationConfig config = activeCommentSyncConfig(boardId);
            if (config != null) {
                try {
                    String token = oauthService.resolveToken(config);
                    jiraApiClient.deleteComment(JiraAuthContext.of(config, token),
                        link.getJiraIssueKey(), link.getJiraCommentId());
                    log.info("JIRA comment delete: {} #{}", link.getJiraIssueKey(), link.getJiraCommentId());
                } catch (Exception e) {
                    // 대표 사유: 이미 삭제됨(404) / "Delete own comments" 권한 없음(403).
                    log.warn("JIRA comment delete failed for {} #{}: {}",
                        link.getJiraIssueKey(), link.getJiraCommentId(), e.getMessage());
                }
            }
        } else {
            // JIRA 발 코멘트 — 삭제하려면 "Delete all comments" 권한이 필요해 시도하지 않는다.
            log.debug("JIRA comment delete skipped (JIRA 원본 보존): {} #{}",
                link.getJiraIssueKey(), link.getJiraCommentId());
        }
        commentLinkRepository.delete(link);
    }

    // ── 인바운드: JIRA → BRIDGE ────────────────────

    /**
     * JIRA 코멘트 1건을 BRIDGE 댓글로 반영(웹훅 {@code comment_created/updated}).
     * 이미 매핑된 코멘트면 no-op — BRIDGE가 방금 올린 코멘트의 에코가 여기서 걸린다.
     * v1은 본문 수정 동기화를 하지 않으므로 {@code updated}는 "놓친 생성"의 보충으로만 쓴다.
     */
    @Transactional
    public void applyRemoteCreate(String boardId, String issueKey, JsonNode commentNode) {
        JiraIntegrationConfig config = activeCommentSyncConfig(boardId);
        if (config == null || commentNode == null || commentNode.isMissingNode()) return;

        String jiraCommentId = commentNode.path("id").asText(null);
        if (jiraCommentId == null) return;
        if (commentLinkRepository.findByBoardIdAndJiraCommentId(boardId, jiraCommentId).isPresent()) return;

        JiraIssueLink issueLink = liveTaskLink(boardId, issueKey);
        if (issueLink == null) return;
        Task task = taskRepository.findById(issueLink.getTargetId()).orElse(null);
        if (task == null) return;

        createInboundComment(config, task, issueKey, jiraCommentId, commentNode);
    }

    /**
     * JIRA에서 삭제된 코멘트를 BRIDGE 댓글에도 반영(웹훅 {@code comment_deleted}).
     * 매핑이 없으면(연동 전 코멘트) no-op.
     */
    @Transactional
    public void applyRemoteDelete(String boardId, String jiraCommentId) {
        if (activeCommentSyncConfig(boardId) == null) return;

        JiraCommentLink link = commentLinkRepository
            .findByBoardIdAndJiraCommentId(boardId, jiraCommentId).orElse(null);
        if (link == null) return;

        String commentId = link.getCommentId();
        commentLinkRepository.delete(link);          // 먼저 끊어 아웃바운드 재전파 여지를 없앤다
        commentService.deleteSystemComment(commentId);
        log.info("JIRA comment deleted → BRIDGE comment {} 삭제 ({} #{})",
            commentId, link.getJiraIssueKey(), jiraCommentId);
    }

    /**
     * 이슈 1건의 코멘트 목록을 통째로 대조하는 백업 경로 — 웹훅 유실 복구용.
     * 폴링 import에서 "JIRA 쪽이 갱신된 이슈"에만 호출한다(코멘트 추가/삭제도 issue.updated를 올림).
     *
     * <p><b>삭제 재조정은 목록이 완전할 때만 수행한다.</b> 코멘트가 100건을 넘어 잘린 응답으로
     * 대조하면 멀쩡한 댓글을 "JIRA에서 삭제됨"으로 오판해 지운다.
     */
    @Transactional
    public void reconcileIssue(String boardId, String issueKey) {
        JiraIntegrationConfig config = activeCommentSyncConfig(boardId);
        if (config == null) return;

        JiraIssueLink issueLink = liveTaskLink(boardId, issueKey);
        if (issueLink == null) return;
        Task task = taskRepository.findById(issueLink.getTargetId()).orElse(null);
        if (task == null) return;

        JsonNode result;
        try {
            String token = oauthService.resolveToken(config);
            result = jiraApiClient.getComments(JiraAuthContext.of(config, token), issueKey);
        } catch (Exception e) {
            log.warn("JIRA comment reconcile failed for {}: {}", issueKey, e.getMessage());
            return;
        }
        if (result == null) return;

        JsonNode comments = result.path("comments");
        if (!comments.isArray()) return;

        // ① 누락된 생성 보충
        Set<String> remoteIds = new HashSet<>();
        for (JsonNode node : comments) {
            String jiraCommentId = node.path("id").asText(null);
            if (jiraCommentId == null) continue;
            remoteIds.add(jiraCommentId);
            if (commentLinkRepository.findByBoardIdAndJiraCommentId(boardId, jiraCommentId).isPresent()) continue;
            createInboundComment(config, task, issueKey, jiraCommentId, node);
        }

        // ② 누락된 삭제 보충 — 목록이 완전할 때만
        boolean complete = result.path("startAt").asInt(0) == 0
            && result.path("total").asInt(Integer.MAX_VALUE) <= comments.size();
        if (!complete) {
            log.debug("JIRA comment reconcile: {} 목록이 잘려 삭제 대조 생략 (total={}, fetched={})",
                issueKey, result.path("total").asInt(-1), comments.size());
            return;
        }

        List<JiraCommentLink> links = commentLinkRepository.findByBoardIdAndTaskId(boardId, task.getId());
        for (JiraCommentLink link : links) {
            if (!issueKey.equals(link.getJiraIssueKey())) continue;
            if (remoteIds.contains(link.getJiraCommentId())) continue;

            String commentId = link.getCommentId();
            commentLinkRepository.delete(link);
            commentService.deleteSystemComment(commentId);
            log.info("JIRA comment reconcile: {} #{} 원격 삭제 감지 → BRIDGE 댓글 {} 삭제",
                issueKey, link.getJiraCommentId(), commentId);
        }
    }

    // ── 내부 ──────────────────────────────────────

    /** 활성 + 댓글 동기화가 켜진 config. 아니면 null(= 조용히 no-op). */
    private JiraIntegrationConfig activeCommentSyncConfig(String boardId) {
        return configRepository.findActiveByBoardId(boardId)
            .filter(JiraIntegrationConfig::isCommentSyncEnabled)
            .orElse(null);
    }

    /** 살아있는 TASK 링크(삭제 표시 제외). */
    private JiraIssueLink liveTaskLink(String boardId, String issueKey) {
        JiraIssueLink link = issueLinkRepository.findByBoardIdAndJiraIssueKey(boardId, issueKey).orElse(null);
        if (link == null || link.getTargetType() != JiraLinkTargetType.TASK || link.isJiraDeleted()) return null;
        return link;
    }

    /** JIRA 코멘트 노드 → BRIDGE 댓글 + 매핑 저장. */
    private void createInboundComment(JiraIntegrationConfig config, Task task, String issueKey,
                                      String jiraCommentId, JsonNode commentNode) {
        Board board = task.getBoard();
        JsonNode authorNode = commentNode.path("author");
        String accountId = authorNode.path("accountId").asText(null);
        String displayName = authorNode.path("displayName").asText(null);

        User author = resolveAuthor(board.getId(), accountId);
        boolean matched = author != null;
        if (author == null) author = config.getConnectedBy();
        if (author == null) return;   // 작성자를 특정할 수 없으면 남기지 않는다

        String body = readBody(commentNode.path("body"));

        // 에코 2차 방어 — 링크 원장만으로는 못 막는 경합이 하나 있다.
        // JIRA는 addComment 응답 직후 webhook을 쏘는데, 그 웹훅이 pushCreate의 커밋(=링크 저장)보다
        // 먼저 도착하면 매핑이 아직 없어 "새 JIRA 코멘트"로 보인다. BRIDGE가 붙인 머리글로 걸러낸다.
        if (body.startsWith(OUTBOUND_PREFIX)) {
            log.debug("JIRA comment pull skipped (BRIDGE 발신 에코): {} #{}", issueKey, jiraCommentId);
            return;
        }

        String content = matched ? body : INBOUND_PREFIX + (displayName != null ? displayName : "알 수 없음")
            + "\n" + body;

        String commentId = commentService
            .createSystemComment(board, task, author, truncate(content, MAX_CONTENT_LENGTH)).getId();

        commentLinkRepository.save(JiraCommentLink.builder()
            .board(board)
            .commentId(commentId)
            .taskId(task.getId())
            .jiraIssueKey(issueKey)
            .jiraCommentId(jiraCommentId)
            .origin(JiraCommentOrigin.JIRA)
            .build());
        log.info("JIRA comment pull: {} #{} → comment {}", issueKey, jiraCommentId, commentId);
    }

    /**
     * JIRA 작성자 accountId → BRIDGE 멤버. 담당자 매칭에서 이미 학습된 매핑만 사용한다
     * (여기서 새 매핑을 만들지는 않는다 — 담당자 사다리는 {@code JiraImportService}의 책임).
     */
    private User resolveAuthor(String boardId, String accountId) {
        if (accountId == null) return null;
        return userMappingRepository.findByBoardIdAndJiraAccountId(boardId, accountId)
            .map(JiraUserMapping::getBridgeUser)
            .orElse(null);
    }

    /** 코멘트 본문 — 표준 API는 ADF, Automation 커스텀 바디는 평문 문자열로 보내기도 한다. */
    private String readBody(JsonNode body) {
        if (body == null || body.isMissingNode() || body.isNull()) return "";
        if (body.isTextual()) return body.asText("");
        return Optional.ofNullable(JiraAdfConverter.toPlainText(body)).orElse("");
    }

    /** JIRA에 쓸 본문 — 누가 썼는지 JIRA 화면에서 알 수 있어야 한다(작성자는 연동 계정으로 고정되므로). */
    private String formatOutbound(Comment comment) {
        String author = comment.getAuthor() != null ? comment.getAuthor().getName() : "알 수 없음";
        String content = comment.getContent() != null ? comment.getContent().trim() : "";
        StringBuilder sb = new StringBuilder(OUTBOUND_PREFIX).append(author).append("\n");
        // 체크리스트 항목 댓글이면 어느 줄에 대한 이야기인지 밝힌다. JIRA 이슈는 태스크 단위라
        // 이걸 빼면 항목별 대화가 맥락 없는 조각으로 섞인다.
        String itemTitle = checklistItemTitle(comment.getChecklistItemId());
        if (itemTitle != null) {
            sb.append("[").append(itemTitle).append("]\n");
        }
        sb.append(content.isEmpty() ? "(내용 없음)" : content);
        if (!comment.getAttachments().isEmpty()) {
            sb.append("\n\n(첨부 ").append(comment.getAttachments().size()).append("건은 BRIDGE에서 확인)");
        }
        return sb.toString();
    }

    /**
     * 체크리스트 항목 제목. 항목이 이미 지워졌으면 null을 돌려 머리글을 생략한다 —
     * 삭제된 줄 제목을 JIRA에 남기는 것보다 없는 편이 낫다.
     */
    private String checklistItemTitle(String checklistItemId) {
        if (checklistItemId == null || checklistItemId.isBlank()) return null;
        return checklistItemRepository.findById(checklistItemId)
            .map(ChecklistItem::getTitle)
            .orElse(null);
    }

    private String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }
}
