package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.note.NoteCommentReaction;
import com.kanban.domain.note.NoteCommentReactionRepository;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 개인(마이 스페이스) 노트 댓글 서비스. {@link OrgNoteCommentService} 의 owner-scope 미러.
 * 개인 노트는 단일 사용자 소유이므로 WebSocket 실시간 브로드캐스트는 생략한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MyNoteCommentService {

    private final NoteCommentRepository noteCommentRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteRepository noteRepository;
    private final UserRepository userRepository;

    public NoteCommentResponse.ListResponse getComments(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);

        List<NoteComment> allComments = noteCommentRepository.findByNoteIdWithDetails(noteId);
        Map<String, String> customEmojiUrlMap = Map.of();

        Map<String, List<NoteComment>> childrenMap = allComments.stream()
                .filter(c -> c.getParent() != null)
                .collect(Collectors.groupingBy(c -> c.getParent().getId()));

        List<NoteCommentResponse.Detail> threads = allComments.stream()
                .filter(NoteComment::isRootComment)
                .map(root -> {
                    List<NoteCommentResponse.Detail> replies = childrenMap.getOrDefault(root.getId(), List.of())
                            .stream()
                            .map(reply -> NoteCommentResponse.Detail.of(reply, List.of(), customEmojiUrlMap))
                            .toList();
                    return NoteCommentResponse.Detail.of(root, replies, customEmojiUrlMap);
                })
                .toList();

        return NoteCommentResponse.ListResponse.builder()
                .threads(threads)
                .totalThreads(threads.size())
                .build();
    }

    @Transactional
    public NoteCommentResponse.Detail createComment(String noteId, String userId,
                                                     NoteCommentRequest.Create request) {
        Note note = getNoteOrThrow(noteId, userId);
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
                .blockId(request.getBlockId())
                .parent(parent)
                .author(user)
                .content(request.getContent())
                .mentions(mentionsStr)
                .build();

        noteCommentRepository.save(comment);

        return NoteCommentResponse.Detail.of(comment, List.of());
    }

    @Transactional
    public NoteCommentResponse.Detail updateComment(String commentId, String userId,
                                                     NoteCommentRequest.Update request) {
        NoteComment comment = getOwnedCommentOrThrow(commentId, userId);

        if (!comment.isAuthor(userId)) {
            throw new BusinessException(ErrorCode.NOTE_COMMENT_NOT_AUTHOR);
        }

        String mentionsStr = request.getMentions() != null && !request.getMentions().isEmpty()
                ? String.join(",", request.getMentions())
                : null;

        comment.updateContent(request.getContent(), mentionsStr);

        return NoteCommentResponse.Detail.of(comment, List.of());
    }

    @Transactional
    public void deleteComment(String commentId, String userId) {
        NoteComment comment = getOwnedCommentOrThrow(commentId, userId);
        // 개인 노트 소유자 == 작성자이므로 추가 권한 체크 불필요.
        noteCommentRepository.delete(comment);
    }

    @Transactional
    public NoteCommentResponse.Detail toggleResolved(String commentId, String userId) {
        NoteComment comment = getOwnedCommentOrThrow(commentId, userId);

        if (!comment.isRootComment()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        comment.toggleResolved(user);

        return NoteCommentResponse.Detail.of(comment, List.of());
    }

    @Transactional
    public NoteCommentResponse.ReactionsResponse toggleReaction(String noteId, String commentId,
                                                                  NoteCommentRequest.ToggleReaction request, String userId) {
        getNoteOrThrow(noteId, userId);

        String emoji = request.getEmoji();
        if (emoji.startsWith("custom:")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "개인 노트에서는 커스텀 이모지를 사용할 수 없습니다");
        }

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Optional<NoteCommentReaction> existing = noteCommentReactionRepository.findByNoteCommentAndUserAndEmoji(
                comment, user, emoji);

        if (existing.isPresent()) {
            comment.getReactions().remove(existing.get());
            noteCommentReactionRepository.delete(existing.get());
        } else {
            NoteCommentReaction reaction = NoteCommentReaction.builder()
                    .noteComment(comment)
                    .user(user)
                    .emoji(emoji)
                    .build();
            noteCommentReactionRepository.save(reaction);
            comment.getReactions().add(reaction);
        }

        List<NoteCommentResponse.ReactionInfo> reactionList = buildReactionInfoList(comment.getReactions());
        return NoteCommentResponse.ReactionsResponse.builder()
                .reactions(reactionList)
                .build();
    }

    // ===== Helpers =====

    private Note getNoteOrThrow(String noteId, String userId) {
        Note note = noteRepository.findByIdAndOwnerUserId(noteId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        if (note.getIsDeleted()) {
            throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
        }
        return note;
    }

    /** 댓글이 현재 사용자 소유의 노트에 속하는지 검증. */
    private NoteComment getOwnedCommentOrThrow(String commentId, String userId) {
        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));
        getNoteOrThrow(comment.getNote().getId(), userId);
        return comment;
    }

    private List<NoteCommentResponse.ReactionInfo> buildReactionInfoList(List<NoteCommentReaction> reactions) {
        if (reactions == null || reactions.isEmpty()) return List.of();

        Map<String, List<NoteCommentReaction>> grouped = reactions.stream()
                .collect(Collectors.groupingBy(
                        NoteCommentReaction::getEmoji,
                        LinkedHashMap::new,
                        Collectors.toList()));

        return grouped.entrySet().stream()
                .map(entry -> NoteCommentResponse.ReactionInfo.builder()
                        .emoji(entry.getKey())
                        .imageUrl(null)
                        .isCustom(false)
                        .count(entry.getValue().size())
                        .users(entry.getValue().stream()
                                .map(r -> NoteCommentResponse.ReactionUserInfo.builder()
                                        .id(r.getUser().getId())
                                        .name(r.getUser().getName())
                                        .build())
                                .toList())
                        .build())
                .toList();
    }
}
