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
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

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
     * 댓글 목록 조회
     */
    public CommentResponse.ListResponse getComments(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Comment> comments = commentRepository.findByTaskIdWithAuthor(taskId);
        return CommentResponse.ListResponse.of(comments);
    }

    /**
     * 댓글 작성 (이미지 첨부 포함)
     */
    @Transactional
    public CommentResponse.Detail createComment(String boardId, String taskId, String userId,
                                                  String content, String mentionsStr, List<MultipartFile> files) {
        boardService.checkMemberOrAbove(boardId, userId);

        // 첨부파일 개수 제한
        if (files != null && files.size() > MAX_ATTACHMENTS) {
            throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
        }

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Comment comment = Comment.builder()
                .task(task)
                .board(board)
                .author(user)
                .content(content)
                .mentions(mentionsStr)
                .build();

        commentRepository.save(comment);

        // 파일 업로드 처리
        if (files != null && !files.isEmpty()) {
            List<String> uploadedKeys = new ArrayList<>();
            try {
                for (MultipartFile file : files) {
                    fileUploadService.validateImageFile(file);
                    FileUploadService.UploadResult result = fileUploadService.upload(file, boardId, comment.getId());
                    uploadedKeys.add(result.getS3Key());

                    CommentAttachment attachment = CommentAttachment.builder()
                            .comment(comment)
                            .originalFileName(file.getOriginalFilename())
                            .s3Key(result.getS3Key())
                            .url(result.getUrl())
                            .contentType(file.getContentType())
                            .fileSize(file.getSize())
                            .build();

                    commentAttachmentRepository.save(attachment);
                    comment.getAttachments().add(attachment);
                }
            } catch (Exception e) {
                // 롤백: 이미 업로드된 파일들 삭제
                for (String key : uploadedKeys) {
                    fileUploadService.delete(key);
                }
                throw e;
            }
        }

        notificationService.createMentionNotifications(comment, user, board);

        log.info("Comment created: {} on task: {} by user: {} with {} attachments",
                comment.getId(), taskId, userId, comment.getAttachments().size());
        return CommentResponse.Detail.of(comment);
    }

    /**
     * 댓글 수정 (본인 댓글만)
     */
    @Transactional
    public CommentResponse.Detail updateComment(String boardId, String commentId, String userId, CommentRequest.Update request) {
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

        log.info("Comment updated: {} by user: {}", commentId, userId);
        return CommentResponse.Detail.of(comment);
    }

    /**
     * 댓글 삭제 (본인 댓글 또는 ADMIN 이상)
     */
    @Transactional
    public void deleteComment(String boardId, String commentId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        // S3에서 첨부파일 삭제
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

        fileUploadService.delete(attachment.getS3Key());
        comment.getAttachments().remove(attachment);
        commentAttachmentRepository.delete(attachment);

        log.info("Attachment deleted: {} from comment: {} by user: {}", attachmentId, commentId, userId);
    }
}
