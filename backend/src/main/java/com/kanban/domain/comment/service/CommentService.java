package com.kanban.domain.comment.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.dto.CommentRequest;
import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommentService {

    private final CommentRepository commentRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;
    private final FileUploadService fileUploadService;

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
     * 댓글 목록 조회
     */
    public CommentResponse.ListResponse getComments(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Comment> comments = commentRepository.findByTaskIdWithAuthor(taskId);
        return CommentResponse.ListResponse.of(comments);
    }

    /**
     * 댓글 작성 (fileKeys: 미리 업로드된 임시 파일 키 목록)
     */
    @Transactional
    public CommentResponse.Detail createComment(String boardId, String taskId, String userId,
                                                  CommentRequest.Create request) {
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

        Comment comment = Comment.builder()
                .task(task)
                .board(board)
                .author(user)
                .content(content)
                .mentions(mentionsStr)
                .build();

        commentRepository.save(comment);

        // 임시 파일 → 영구 저장 + 썸네일 생성
        if (fileKeys != null && !fileKeys.isEmpty()) {
            processFileKeys(fileKeys, boardId, comment);
        }

        notificationService.createMentionNotifications(comment, user, board);

        log.info("Comment created: {} on task: {} by user: {} with {} attachments",
                comment.getId(), taskId, userId, comment.getAttachments().size());
        return CommentResponse.Detail.of(comment);
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
        return CommentResponse.Detail.of(comment);
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

        commentRepository.delete(comment);
        log.info("Comment deleted: {} by user: {}", commentId, userId);
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
