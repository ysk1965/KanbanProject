package com.kanban.domain.comment.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardCustomEmoji;
import com.kanban.domain.board.BoardCustomEmojiRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentReaction;
import com.kanban.domain.comment.CommentReactionRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.dto.CommentRequest;
import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.comment.event.CommentCreatedEvent;
import com.kanban.domain.comment.event.CommentDeletedEvent;
import com.kanban.domain.integration.discord.service.DiscordNotificationService;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommentService {

    private final CommentRepository commentRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentReactionRepository commentReactionRepository;
    private final BoardCustomEmojiRepository boardCustomEmojiRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;
    private final DiscordNotificationService discordNotificationService;
    private final FileUploadService fileUploadService;
    private final ChecklistItemRepository checklistItemRepository;
    private final WebSocketEventService webSocketEventService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    private static final int MAX_ATTACHMENTS = 5;

    /**
     * 특정 보드 + 작성자의 기간별 댓글 조회 (주간 요약용)
     */
    public CommentResponse.SummaryListResponse getCommentsByAuthorAndDateRange(
            String boardId, String authorId, String requesterId,
            LocalDate startDate, LocalDate endDate) {
        boardService.checkViewerOrAbove(boardId, requesterId);

        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.plusDays(1).atStartOfDay();

        List<Comment> comments = commentRepository.findByBoardAndAuthorAndDateRange(
                boardId, authorId, startDateTime, endDateTime);
        return CommentResponse.SummaryListResponse.of(comments);
    }

    /**
     * 특정 보드 + 멘션된 사용자의 기간별 댓글 조회
     */
    public CommentResponse.MentionSummaryListResponse getCommentsByMentionedUserAndDateRange(
            String boardId, String mentionedUserId, String requesterId,
            LocalDate startDate, LocalDate endDate) {
        boardService.checkViewerOrAbove(boardId, requesterId);

        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.plusDays(1).atStartOfDay();

        List<Comment> comments = commentRepository.findByBoardAndMentionedUserAndDateRange(
                boardId, mentionedUserId, startDateTime, endDateTime);

        // LIKE 쿼리의 부분 매칭 방지를 위해 exact match 필터
        List<Comment> filtered = comments.stream()
                .filter(c -> {
                    if (c.getMentions() == null) return false;
                    return Arrays.stream(c.getMentions().split(","))
                            .map(String::trim)
                            .anyMatch(id -> id.equals(mentionedUserId));
                })
                .toList();

        return CommentResponse.MentionSummaryListResponse.of(filtered);
    }

    /**
     * 댓글 목록 조회
     */
    public CommentResponse.ListResponse getComments(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Comment> comments = commentRepository.findByTaskIdWithAuthorAndReactions(taskId);
        Map<String, String> customEmojiUrlMap = buildCustomEmojiUrlMap(boardId);
        return CommentResponse.ListResponse.of(comments, customEmojiUrlMap, fileUploadService::resolveUrl,
                buildChecklistRefMap(comments));
    }

    /**
     * 댓글들이 가리키는 체크리스트 항목의 제목을 한 번에 조회한다.
     * 삭제된 항목도 포함한다 — 항목을 휴지통에 넣어도 그 대화는 태스크 댓글 목록에 계속 남는다.
     */
    private Map<String, CommentResponse.ChecklistRef> buildChecklistRefMap(List<Comment> comments) {
        List<String> itemIds = comments.stream()
                .map(Comment::getChecklistItemId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (itemIds.isEmpty()) return Map.of();

        Map<String, CommentResponse.ChecklistRef> refs = new HashMap<>();
        for (Object[] row : checklistItemRepository.findTitlesByIdsIncludingDeleted(itemIds)) {
            refs.put((String) row[0], CommentResponse.ChecklistRef.builder()
                    .title((String) row[1])
                    .deleted(Boolean.TRUE.equals(row[2]))
                    .build());
        }
        return refs;
    }

    /**
     * 댓글 작성 (fileKeys: 미리 업로드된 임시 파일 키 목록)
     */
    @Transactional
    public CommentResponse.Detail createComment(String boardId, String taskId, String userId,
                                                  CommentRequest.Create request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<String> fileKeys = request.getFileKeys();
        if (fileKeys != null && fileKeys.size() > MAX_ATTACHMENTS) {
            throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
        }

        // content가 비어있으면서 첨부파일도 없으면 에러
        String content = request.getContent();
        if ((content == null || content.isBlank()) && (fileKeys == null || fileKeys.isEmpty())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (content == null || content.isBlank()) {
            content = ""; // 이미지만 첨부한 경우
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String mentionsStr = request.getMentions() != null && !request.getMentions().isEmpty()
                ? String.join(",", request.getMentions())
                : null;

        Comment parentComment = null;
        if (request.getParentId() != null && !request.getParentId().isBlank()) {
            parentComment = commentRepository.findById(request.getParentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));
        }

        // 체크리스트 항목 댓글이면 그 항목이 이 태스크의 것인지 반드시 확인한다.
        // 검증을 빼면 다른 태스크의 항목에 댓글을 꽂는 경로가 열린다.
        ChecklistItem checklistItem = null;
        String checklistItemId = request.getChecklistItemId();
        if (checklistItemId != null && !checklistItemId.isBlank()) {
            checklistItem = checklistItemRepository.findById(checklistItemId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
            if (!checklistItem.getTask().getId().equals(taskId)) {
                throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
            }
        } else {
            checklistItemId = null;
        }

        Comment comment = Comment.builder()
                .task(task)
                .board(board)
                .author(user)
                .content(content)
                .mentions(mentionsStr)
                .parent(parentComment)
                .checklistItemId(checklistItemId)
                .build();

        commentRepository.save(comment);

        // 임시 파일 → 영구 저장 + 썸네일 생성
        if (fileKeys != null && !fileKeys.isEmpty()) {
            processFileKeys(fileKeys, boardId, comment);
        }

        // 알림 전송 (실패해도 댓글 생성은 유지)
        try {
            notificationService.createMentionNotifications(comment, user, board);
            slackNotificationService.sendMentionNotifications(comment, user, board, originUrl);
            discordNotificationService.sendMentionNotifications(comment, user, board, originUrl);

            // TASK_COMMENT: 태스크 관련자에게 알림 (생성자 + 체크리스트 배정자, 멘션 수신자 제외)
            Set<String> mentionedUserIds = new HashSet<>();
            if (comment.getMentions() != null && !comment.getMentions().isEmpty()) {
                Arrays.stream(comment.getMentions().split(","))
                        .map(String::trim)
                        .forEach(mentionedUserIds::add);
            }

            Set<String> taskRelatedUserIdSet = new LinkedHashSet<>();
            // 태스크 생성자
            if (task.getCreatedBy() != null) {
                taskRelatedUserIdSet.add(task.getCreatedBy().getId());
            }
            if (checklistItem != null) {
                // 항목 댓글은 그 항목 담당자에게만 간다. 태스크의 전체 담당자에게 뿌리면
                // 20줄짜리 체크리스트에서 알림이 20배가 된다 — 상관없는 줄의 대화까지 전부 받는다.
                if (checklistItem.getAssignee() != null) {
                    taskRelatedUserIdSet.add(checklistItem.getAssignee().getId());
                }
            } else {
                // 태스크 댓글: 지금까지처럼 체크리스트 배정자 전원
                taskRelatedUserIdSet.addAll(checklistItemRepository.findDistinctAssigneeIdsByTaskId(taskId));
            }
            List<String> taskRelatedUserIds = new ArrayList<>(taskRelatedUserIdSet);

            if (!taskRelatedUserIds.isEmpty()) {
                notificationService.createTaskCommentNotifications(comment, user, board, taskRelatedUserIds, mentionedUserIds);
                slackNotificationService.sendTaskCommentNotifications(comment, user, board, taskRelatedUserIds, mentionedUserIds, originUrl);
                discordNotificationService.sendTaskCommentNotifications(comment, user, board, taskRelatedUserIds, mentionedUserIds, originUrl);
            }
        } catch (Exception e) {
            log.error("Failed to send comment notifications for comment: {} on task: {}: {}",
                    comment.getId(), taskId, e.getMessage(), e);
        }

        log.info("Comment created: {} on task: {} by user: {} with {} attachments",
                comment.getId(), taskId, userId, comment.getAttachments().size());

        // 항목 제목을 응답에 실어 보낸다. 이 응답이 그대로 WebSocket 페이로드가 되므로,
        // 다른 사람 화면도 재조회 없이 "체크리스트 · 제목" 칩을 그릴 수 있어야 한다.
        Map<String, CommentResponse.ChecklistRef> refs = checklistItem != null
                ? Map.of(checklistItem.getId(), CommentResponse.ChecklistRef.builder()
                        .title(checklistItem.getTitle()).deleted(false).build())
                : Map.of();

        CommentResponse.Detail response = CommentResponse.Detail.of(comment, Map.of(), fileUploadService::resolveUrl, refs);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.COMMENT_CREATED, userId, user.getName(), response);

        // JIRA 연동 카드면 댓글을 JIRA 코멘트로 push (커밋 후 비동기). core→jira 역의존 회피용 이벤트.
        eventPublisher.publishEvent(new CommentCreatedEvent(boardId, taskId, comment.getId()));
        return response;
    }

    /**
     * 댓글 수정 (텍스트 + 첨부파일 추가/삭제)
     */
    @Transactional
    public CommentResponse.Detail updateComment(String boardId, String commentId, String userId,
                                                  CommentRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            throw new BusinessException(ErrorCode.COMMENT_NOT_AUTHOR);
        }

        String mentionsStr = request.getMentions() != null && !request.getMentions().isEmpty()
                ? String.join(",", request.getMentions())
                : null;

        comment.updateContent(request.getContent(), mentionsStr);

        // 첨부파일 처리: keepAttachmentIds에 없는 기존 첨부파일은 삭제
        if (request.getKeepAttachmentIds() != null) {
            Set<String> keepIds = Set.copyOf(request.getKeepAttachmentIds());
            List<CommentAttachment> toRemove = comment.getAttachments().stream()
                    .filter(att -> !keepIds.contains(att.getId()))
                    .toList();

            for (CommentAttachment att : toRemove) {
                fileUploadService.delete(att.getS3Key());
                comment.getAttachments().remove(att);
                commentAttachmentRepository.delete(att);
                log.info("Attachment removed during edit: {}", att.getId());
            }
        }

        // 새 파일 추가
        List<String> newFileKeys = request.getNewFileKeys();
        if (newFileKeys != null && !newFileKeys.isEmpty()) {
            int totalAfter = comment.getAttachments().size() + newFileKeys.size();
            if (totalAfter > MAX_ATTACHMENTS) {
                throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
            }
            processFileKeys(newFileKeys, boardId, comment);
        }

        log.info("Comment updated: {} by user: {} (attachments: {})",
                commentId, userId, comment.getAttachments().size());

        // 수정 응답도 WS 페이로드로 나간다 — 칩이 사라지지 않도록 항목 제목을 다시 실어 준다.
        CommentResponse.Detail response = CommentResponse.Detail.of(comment, Map.of(),
                fileUploadService::resolveUrl, buildChecklistRefMap(List.of(comment)));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.COMMENT_UPDATED, userId, user.getName(), response);
        return response;
    }

    /**
     * 댓글 삭제 (본인 또는 ADMIN 이상)
     */
    @Transactional
    public void deleteComment(String boardId, String commentId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        // 첨부파일 S3/로컬 삭제
        for (CommentAttachment attachment : comment.getAttachments()) {
            fileUploadService.delete(attachment.getS3Key());
        }

        String checklistItemId = comment.getChecklistItemId();
        commentRepository.delete(comment);
        log.info("Comment deleted: {} by user: {}", commentId, userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        String taskId = comment.getTask().getId();

        // 항목 id를 함께 보낸다 — 받는 쪽이 어느 체크리스트 행의 댓글 수를 줄여야 하는지 알아야 한다.
        // (Map.of는 null 값을 허용하지 않아 HashMap을 쓴다)
        Map<String, Object> deletePayload = new HashMap<>();
        deletePayload.put("id", commentId);
        deletePayload.put("task_id", taskId);
        deletePayload.put("checklist_item_id", checklistItemId);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.COMMENT_DELETED, userId, user.getName(), deletePayload);

        // JIRA로 연동된 댓글이면 JIRA 코멘트도 삭제 (커밋 후 비동기).
        eventPublisher.publishEvent(new CommentDeletedEvent(boardId, taskId, commentId));
    }

    // ── 시스템 경로 (JIRA 인바운드 전용) ─────────────────────────────
    //
    // 권한 검사를 건너뛰고 도메인 이벤트도 발행하지 않는다.
    //  · 권한: JIRA에서 들어온 댓글의 author는 연동 계정이라 일반 경로(본인/ADMIN)로는 손댈 수 없다.
    //  · 이벤트: 발행하면 방금 JIRA에서 받은 내용을 JIRA로 되돌려보내 에코가 된다.
    // WebSocket 브로드캐스트는 그대로 — 열려 있는 카드가 즉시 갱신되어야 하므로.

    /** JIRA 코멘트 → BRIDGE 댓글 생성. 알림은 보내지 않는다(원본 알림은 JIRA가 이미 처리). */
    @Transactional
    public CommentResponse.Detail createSystemComment(Board board, Task task, User author, String content) {
        Comment comment = Comment.builder()
                .task(task)
                .board(board)
                .author(author)
                .content(content)
                .build();
        commentRepository.save(comment);

        CommentResponse.Detail response = CommentResponse.Detail.of(comment, Map.of(), fileUploadService::resolveUrl);
        webSocketEventService.sendBoardEvent(board.getId(), BoardEventType.COMMENT_CREATED,
                "jira-sync", "JIRA", response);
        return response;
    }

    /** JIRA 코멘트 삭제 → BRIDGE 댓글 삭제. 대상이 이미 없으면 조용히 통과(멱등). */
    @Transactional
    public void deleteSystemComment(String commentId) {
        Comment comment = commentRepository.findById(commentId).orElse(null);
        if (comment == null) return;

        String boardId = comment.getBoard().getId();
        String taskId = comment.getTask().getId();
        for (CommentAttachment attachment : comment.getAttachments()) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentRepository.delete(comment);
        log.info("Comment deleted by JIRA sync: {}", commentId);

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.COMMENT_DELETED,
                "jira-sync", "JIRA", Map.of("id", commentId, "task_id", taskId));
    }

    /**
     * 첨부파일 개별 삭제
     */
    @Transactional
    public void deleteAttachment(String boardId, String commentId, String attachmentId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        CommentAttachment attachment = commentAttachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND));

        // ★ 소속 검증: 첨부파일이 해당 댓글에 속하는지 확인
        if (!attachment.getComment().getId().equals(commentId)) {
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        }

        fileUploadService.delete(attachment.getS3Key());
        comment.getAttachments().remove(attachment);
        commentAttachmentRepository.delete(attachment);

        log.info("Attachment deleted: {} from comment: {} by user: {}", attachmentId, commentId, userId);
    }

    /**
     * 이모지 리액션 토글 (추가/제거)
     */
    @Transactional
    public CommentResponse.ReactionsResponse toggleReaction(String boardId, String commentId, String userId, String emoji) {
        boardService.checkMemberOrAbove(boardId, userId);

        // 커스텀 이모지인 경우 보드에 존재하는지 검증
        if (emoji.startsWith("custom:")) {
            String emojiId = emoji.substring("custom:".length());
            if (!boardCustomEmojiRepository.existsById(emojiId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        }

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Optional<CommentReaction> existing = commentReactionRepository.findByCommentIdAndUserIdAndEmoji(
                commentId, userId, emoji);

        if (existing.isPresent()) {
            comment.getReactions().remove(existing.get());
            commentReactionRepository.delete(existing.get());
            log.info("Reaction removed: {} from comment: {} by user: {}", emoji, commentId, userId);
        } else {
            CommentReaction reaction = CommentReaction.builder()
                    .comment(comment)
                    .user(user)
                    .emoji(emoji)
                    .build();
            commentReactionRepository.save(reaction);
            comment.getReactions().add(reaction);
            log.info("Reaction added: {} to comment: {} by user: {}", emoji, commentId, userId);
        }

        // 업데이트된 리액션 목록 반환
        Map<String, String> customEmojiUrlMap = buildCustomEmojiUrlMap(boardId);
        List<CommentResponse.ReactionInfo> reactionList = buildReactionInfoList(comment.getReactions(), customEmojiUrlMap);
        CommentResponse.ReactionsResponse response = CommentResponse.ReactionsResponse.builder()
                .reactions(reactionList)
                .build();

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.COMMENT_REACTION_TOGGLED, userId, user.getName(), response);
        return response;
    }

    private Map<String, String> buildCustomEmojiUrlMap(String boardId) {
        List<BoardCustomEmoji> customEmojis = boardCustomEmojiRepository.findByBoardIdOrderByCreatedAtAsc(boardId);
        Map<String, String> map = new HashMap<>();
        for (BoardCustomEmoji e : customEmojis) {
            map.put(e.getId(), e.getImageUrl());
        }
        return map;
    }

    private List<CommentResponse.ReactionInfo> buildReactionInfoList(List<CommentReaction> reactions,
                                                                      Map<String, String> customEmojiUrlMap) {
        if (reactions == null || reactions.isEmpty()) return List.of();

        Map<String, List<CommentReaction>> grouped = reactions.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        CommentReaction::getEmoji,
                        java.util.LinkedHashMap::new,
                        java.util.stream.Collectors.toList()));

        return grouped.entrySet().stream()
                .map(entry -> {
                    String emoji = entry.getKey();
                    boolean isCustom = emoji.startsWith("custom:");
                    String imageUrl = null;
                    if (isCustom) {
                        String emojiId = emoji.substring("custom:".length());
                        imageUrl = customEmojiUrlMap.get(emojiId);
                    }
                    return CommentResponse.ReactionInfo.builder()
                            .emoji(emoji)
                            .imageUrl(imageUrl)
                            .isCustom(isCustom)
                            .count(entry.getValue().size())
                            .users(entry.getValue().stream()
                                    .map(r -> CommentResponse.ReactionUserInfo.builder()
                                            .id(r.getUser().getId())
                                            .name(r.getUser().getName())
                                            .build())
                                    .toList())
                            .build();
                })
                .toList();
    }

    /**
     * 임시 파일 키들을 영구 저장소로 이동 + 첨부파일 레코드 생성
     */
    private void processFileKeys(List<String> fileKeys, String boardId, Comment comment) {
        List<String> processedKeys = new ArrayList<>();

        try {
            for (String tempKey : fileKeys) {
                // 임시 파일 존재 확인
                if (!fileUploadService.tempFileExists(tempKey)) {
                    throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
                }

                FileUploadService.PermanentResult result =
                        fileUploadService.moveToPermanent(tempKey, boardId, comment.getId());
                processedKeys.add(result.getS3Key());

                // 원본 파일명 추출 (temp key에서 확장자 추출)
                String originalName = tempKey.contains("/")
                        ? tempKey.substring(tempKey.lastIndexOf("/") + 1)
                        : tempKey;

                CommentAttachment attachment = CommentAttachment.builder()
                        .comment(comment)
                        .originalFileName(originalName)
                        .s3Key(result.getS3Key())
                        .url(result.getUrl())
                        .thumbnailS3Key(result.getThumbnailS3Key())
                        .thumbnailUrl(result.getThumbnailUrl())
                        .contentType(result.getContentType())
                        .fileSize(result.getFileSize())
                        .build();

                commentAttachmentRepository.save(attachment);
                comment.getAttachments().add(attachment);
            }
        } catch (Exception e) {
            // 롤백: 이미 이동된 파일들 삭제
            for (String key : processedKeys) {
                fileUploadService.delete(key);
            }
            throw e;
        }
    }
}
