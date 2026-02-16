package com.kanban.domain.note.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NoteCommentService {

    private final NoteCommentRepository noteCommentRepository;
    private final NoteRepository noteRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;
    private final WebSocketEventService webSocketEventService;

    public NoteCommentResponse.ListResponse getComments(String boardId, String noteId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<NoteComment> allComments = noteCommentRepository.findByNoteIdWithDetails(noteId);

        Map<String, List<NoteComment>> childrenMap = allComments.stream()
                .filter(c -> c.getParent() != null)
                .collect(Collectors.groupingBy(c -> c.getParent().getId()));

        List<NoteCommentResponse.Detail> threads = allComments.stream()
                .filter(NoteComment::isRootComment)
                .map(root -> {
                    List<NoteCommentResponse.Detail> replies = childrenMap.getOrDefault(root.getId(), List.of())
                            .stream()
                            .map(reply -> NoteCommentResponse.Detail.of(reply, List.of()))
                            .toList();
                    return NoteCommentResponse.Detail.of(root, replies);
                })
                .toList();

        return NoteCommentResponse.ListResponse.builder()
                .threads(threads)
                .totalThreads(threads.size())
                .build();
    }

    @Transactional
    public NoteCommentResponse.Detail createComment(String boardId, String noteId, String userId,
                                                     NoteCommentRequest.Create request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        NoteComment parent = null;
        if (request.getParentId() != null) {
            parent = noteCommentRepository.findById(request.getParentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));
        }

        String mentionsStr = request.getMentions() != null && !request.getMentions().isEmpty()
                ? String.join(",", request.getMentions())
                : null;

        NoteComment comment = NoteComment.builder()
                .note(note)
                .board(board)
                .blockId(request.getBlockId())
                .parent(parent)
                .author(user)
                .content(request.getContent())
                .mentions(mentionsStr)
                .build();

        noteCommentRepository.save(comment);

        // Send mention notifications
        notificationService.createNoteCommentMentionNotifications(comment, user, board);
        slackNotificationService.sendNoteCommentMentionNotifications(comment, user, board, originUrl);

        NoteCommentResponse.Detail response = NoteCommentResponse.Detail.of(comment, List.of());
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.NOTE_COMMENT_CREATED,
                userId, user.getName(), response);
        return response;
    }

    @Transactional
    public NoteCommentResponse.Detail updateComment(String boardId, String commentId, String userId,
                                                     NoteCommentRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            throw new BusinessException(ErrorCode.NOTE_COMMENT_NOT_AUTHOR);
        }

        String mentionsStr = request.getMentions() != null && !request.getMentions().isEmpty()
                ? String.join(",", request.getMentions())
                : null;

        comment.updateContent(request.getContent(), mentionsStr);

        NoteCommentResponse.Detail response = NoteCommentResponse.Detail.of(comment, List.of());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.NOTE_COMMENT_UPDATED,
                userId, user.getName(), response);
        return response;
    }

    @Transactional
    public void deleteComment(String boardId, String commentId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        String noteId = comment.getNote().getId();
        noteCommentRepository.delete(comment);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.NOTE_COMMENT_DELETED,
                userId, user.getName(), Map.of("id", commentId, "note_id", noteId));
    }

    @Transactional
    public NoteCommentResponse.Detail toggleResolved(String boardId, String commentId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        if (!comment.isRootComment()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        comment.toggleResolved(user);

        NoteCommentResponse.Detail response = NoteCommentResponse.Detail.of(comment, List.of());
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.NOTE_COMMENT_RESOLVED,
                userId, user.getName(), response);
        return response;
    }
}
