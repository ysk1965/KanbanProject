package com.kanban.domain.comment.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.comment.dto.CommentRequest;
import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommentService {

    private final CommentRepository commentRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;

    /**
     * 댓글 목록 조회
     */
    public CommentResponse.ListResponse getComments(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Comment> comments = commentRepository.findByTaskIdWithAuthor(taskId);
        return CommentResponse.ListResponse.of(comments);
    }

    /**
     * 댓글 작성
     */
    @Transactional
    public CommentResponse.Detail createComment(String boardId, String taskId, String userId, CommentRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

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
                .content(request.getContent())
                .mentions(mentionsStr)
                .build();

        commentRepository.save(comment);
        notificationService.createMentionNotifications(comment, user, board);

        log.info("Comment created: {} on task: {} by user: {}", comment.getId(), taskId, userId);
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

        // 본인 댓글이 아닌 경우 ADMIN 이상 권한 필요
        if (!comment.isAuthor(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        commentRepository.delete(comment);
        log.info("Comment deleted: {} by user: {}", commentId, userId);
    }
}
