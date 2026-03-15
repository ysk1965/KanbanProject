package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.note.NoteCommentReaction;
import com.kanban.domain.note.NoteCommentReactionRepository;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
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
public class OrgNoteCommentService {

    private final NoteCommentRepository noteCommentRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteRepository noteRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final WebSocketEventService webSocketEventService;

    public NoteCommentResponse.ListResponse getComments(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<NoteComment> allComments = noteCommentRepository.findByNoteIdWithDetails(noteId);
        // No custom emoji for org notes
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
    public NoteCommentResponse.Detail createComment(String orgId, String noteId, String userId,
                                                     NoteCommentRequest.Create request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = noteRepository.findByIdAndOrganizationId(noteId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        if (note.getIsDeleted()) {
            throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
        }
        Organization org = note.getOrganization();
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
                .organization(org)
                .blockId(request.getBlockId())
                .parent(parent)
                .author(user)
                .content(request.getContent())
                .mentions(mentionsStr)
                .build();

        noteCommentRepository.save(comment);

        NoteCommentResponse.Detail response = NoteCommentResponse.Detail.of(comment, List.of());
        webSocketEventService.sendOrgEvent(orgId, BoardEventType.NOTE_COMMENT_CREATED,
                userId, user.getName(), response);
        return response;
    }

    @Transactional
    public NoteCommentResponse.Detail updateComment(String orgId, String commentId, String userId,
                                                     NoteCommentRequest.Update request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

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
        webSocketEventService.sendOrgEvent(orgId, BoardEventType.NOTE_COMMENT_UPDATED,
                userId, user.getName(), response);
        return response;
    }

    @Transactional
    public void deleteComment(String orgId, String commentId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        if (!comment.isAuthor(userId)) {
            organizationService.checkAdminOrAbove(orgId, userId);
        }

        String noteId = comment.getNote().getId();
        noteCommentRepository.delete(comment);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendOrgEvent(orgId, BoardEventType.NOTE_COMMENT_DELETED,
                userId, user.getName(), Map.of("id", commentId, "note_id", noteId));
    }

    @Transactional
    public NoteCommentResponse.Detail toggleResolved(String orgId, String commentId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        NoteComment comment = noteCommentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_COMMENT_NOT_FOUND));

        if (!comment.isRootComment()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        comment.toggleResolved(user);

        NoteCommentResponse.Detail response = NoteCommentResponse.Detail.of(comment, List.of());
        webSocketEventService.sendOrgEvent(orgId, BoardEventType.NOTE_COMMENT_RESOLVED,
                userId, user.getName(), response);
        return response;
    }

    @Transactional
    public NoteCommentResponse.ReactionsResponse toggleReaction(String orgId, String noteId, String commentId,
                                                                  NoteCommentRequest.ToggleReaction request, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        String emoji = request.getEmoji();

        // Org notes do not support custom emoji
        if (emoji.startsWith("custom:")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "조직 노트에서는 커스텀 이모지를 사용할 수 없습니다");
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
        NoteCommentResponse.ReactionsResponse response = NoteCommentResponse.ReactionsResponse.builder()
                .reactions(reactionList)
                .build();

        webSocketEventService.sendOrgEvent(orgId, BoardEventType.NOTE_COMMENT_REACTION_TOGGLED,
                userId, user.getName(), response);
        return response;
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
