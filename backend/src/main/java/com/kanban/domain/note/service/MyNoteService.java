package com.kanban.domain.note.service;

import com.kanban.domain.note.*;
import com.kanban.domain.note.dto.NoteRequest;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 개인(마이 스페이스) 노트 서비스. {@link OrgNoteService} 의 owner-scope 미러.
 *
 * 조직 스코프와의 유일한 차이:
 *  - 스코프 판별: organization_id 대신 owner_user_id
 *  - 권한: 조직 멤버십 대신 "노트 소유자 == 현재 사용자" (findByIdAndOwnerUserId 로 강제)
 *  - board-notes 집계 없음 (개인 스코프는 보드 파생 목록 미노출)
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MyNoteService {

    private final NoteRepository noteRepository;
    private final NoteTagRepository noteTagRepository;
    private final NoteTagMappingRepository noteTagMappingRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final NoteCommentRepository noteCommentRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteCollabStateRepository noteCollabStateRepository;
    private final NoteDraftArchiveRepository noteDraftArchiveRepository;
    private final NoteCollabService noteCollabService;
    private final NoteLikeRepository noteLikeRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    // ===== Note CRUD =====

    public List<NoteResponse.TreeItem> getNoteTree(String userId) {
        List<Note> allNotes = noteRepository.findAllByOwnerUserIdNotDeleted(userId);
        List<String> noteIds = allNotes.stream().map(Note::getId).toList();

        Map<String, List<NoteResponse.TagInfo>> tagMap = getTagMapForNotes(noteIds);

        Map<String, List<Note>> childrenMap = allNotes.stream()
                .filter(n -> n.getParent() != null)
                .collect(Collectors.groupingBy(n -> n.getParent().getId()));

        List<Note> roots = allNotes.stream()
                .filter(n -> n.getParent() == null)
                .sorted(Comparator.comparingInt(Note::getPosition))
                .toList();

        return roots.stream()
                .map(root -> buildTreeItem(root, childrenMap, tagMap))
                .toList();
    }

    public List<NoteResponse.ListItem> getNoteList(String userId) {
        List<Note> documents = noteRepository.findAllDocumentsAndBoardsByOwnerUserId(userId);
        List<String> noteIds = documents.stream().map(Note::getId).toList();
        Map<String, List<NoteResponse.TagInfo>> tagMap = getTagMapForNotes(noteIds);

        return documents.stream()
                .map(note -> {
                    String parentTitle = note.getParent() != null ? note.getParent().getTitle() : null;
                    return NoteResponse.ListItem.of(note, parentTitle, tagMap.getOrDefault(note.getId(), List.of()));
                })
                .toList();
    }

    public NoteResponse.Detail getNoteDetail(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        boolean hasDraft = noteCollabService.hasUnpublishedDraft(noteId, note.getUpdatedAt());

        int likeCount = noteLikeRepository.countByNoteId(noteId);
        boolean liked = noteLikeRepository.existsByNoteIdAndUserId(noteId, userId);

        return NoteResponse.Detail.of(note, tags, versionCount, hasDraft, likeCount, liked);
    }

    @Transactional
    public NoteResponse.Detail toggleLike(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean exists = noteLikeRepository.existsByNoteIdAndUserId(noteId, userId);
        if (exists) {
            noteLikeRepository.deleteByNoteIdAndUserId(noteId, userId);
        } else {
            noteLikeRepository.save(NoteLike.builder().note(note).user(user).build());
        }

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        boolean hasDraft = noteCollabService.hasUnpublishedDraft(noteId, note.getUpdatedAt());
        int likeCount = noteLikeRepository.countByNoteId(noteId);
        boolean liked = !exists;

        return NoteResponse.Detail.of(note, tags, versionCount, hasDraft, likeCount, liked);
    }

    @Transactional
    public NoteResponse.Detail createNote(String userId, NoteRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        NoteType type = NoteType.valueOf(request.getType());
        Note parent = null;
        int depth = 0;
        int position;

        if (request.getParentId() != null) {
            parent = getNoteOrThrow(request.getParentId(), userId);
            depth = parent.getDepth() + 1;
            if (depth > Note.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더 깊이는 최대 5단계입니다");
            }
            position = noteRepository.findNextChildPosition(parent.getId());
        } else {
            position = noteRepository.findNextRootPositionByOwnerUserId(userId);
        }

        Note note = Note.builder()
                .owner(user)
                .parent(parent)
                .type(type)
                .title(request.getTitle())
                .content(type == NoteType.DOCUMENT || type == NoteType.BOARD ? request.getContent() : null)
                .position(position)
                .depth(depth)
                .createdBy(user)
                .updatedBy(user)
                .build();

        noteRepository.save(note);

        if (request.getTagIds() != null && !request.getTagIds().isEmpty()) {
            syncNoteTags(note, request.getTagIds());
        }

        List<NoteResponse.TagInfo> tags = getTagsForNote(note.getId());
        return NoteResponse.Detail.of(note, tags, 0);
    }

    @Retryable(retryFor = DataIntegrityViolationException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 50, multiplier = 2.0))
    @Transactional
    public NoteResponse.Detail updateNote(String noteId, String userId,
                                           NoteRequest.Update request, boolean createVersion) {
        Note note = getNoteOrThrow(noteId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);

        boolean contentChanged = request.getContent() != null
                && !Objects.equals(request.getContent(), note.getContent());
        boolean titleChanged = request.getTitle() != null
                && !Objects.equals(request.getTitle(), note.getTitle());
        boolean hasChanges = contentChanged || titleChanged;

        if (createVersion && hasChanges) {
            versionCount = versionCount + 1;
            NoteVersion version = NoteVersion.createFrom(note, user, versionCount);
            noteVersionRepository.save(version);
        }

        boolean publishedNewSnapshot = createVersion && hasChanges;

        if (request.getTitle() != null) {
            note.updateTitle(request.getTitle());
        }
        if (request.getContent() != null) {
            note.updateContent(request.getContent(), user);
        }

        if (request.getTagIds() != null) {
            noteTagMappingRepository.deleteAllByNoteId(noteId);
            if (!request.getTagIds().isEmpty()) {
                syncNoteTags(note, request.getTagIds());
            }
        }

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);

        if (publishedNewSnapshot) {
            noteCollabService.deleteState(noteId);
            eventPublisher.publishEvent(new NoteDraftDiscardedEvent(noteId));
            eventPublisher.publishEvent(new NoteSnapshotSavedEvent(noteId));
        }

        boolean hasDraft = !publishedNewSnapshot
                && noteCollabService.hasUnpublishedDraft(noteId, note.getUpdatedAt());
        return NoteResponse.Detail.of(note, tags, versionCount, hasDraft);
    }

    @Transactional
    public void deleteNote(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        softDeleteRecursive(note, actor);
    }

    // ===== Trash =====

    public List<NoteResponse.TrashItem> getTrash(String userId) {
        List<Note> trash = noteRepository.findTrashByOwnerUserId(userId);
        Set<String> trashIds = trash.stream().map(Note::getId).collect(Collectors.toSet());
        Set<String> parentsInTrash = trash.stream()
                .filter(n -> n.getParent() != null && trashIds.contains(n.getParent().getId()))
                .map(n -> n.getParent().getId())
                .collect(Collectors.toSet());

        return trash.stream()
                .map(n -> NoteResponse.TrashItem.of(n, parentsInTrash.contains(n.getId())))
                .toList();
    }

    @Transactional
    public NoteResponse.Detail restoreNote(String noteId, String userId) {
        Note note = noteRepository.findByIdAndOwnerUserId(noteId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        if (!Boolean.TRUE.equals(note.getIsDeleted())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "이미 복구된 노트입니다");
        }

        Note parent = note.getParent();
        if (parent == null || Boolean.TRUE.equals(parent.getIsDeleted())) {
            int rootPos = noteRepository.findNextRootPositionByOwnerUserId(userId);
            note.moveTo(null, rootPos);
        }
        restoreRecursive(note);

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public void permanentDeleteNote(String noteId, String userId) {
        Note note = noteRepository.findByIdAndOwnerUserId(noteId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        if (!Boolean.TRUE.equals(note.getIsDeleted())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "휴지통의 노트만 영구 삭제할 수 있습니다");
        }
        hardDeleteRecursive(note);
    }

    @Transactional
    public int emptyTrash(String userId) {
        List<Note> trash = noteRepository.findAllTrashByOwnerUserId(userId);
        if (trash.isEmpty()) return 0;

        Set<String> trashIds = trash.stream().map(Note::getId).collect(Collectors.toSet());
        List<Note> roots = trash.stream()
                .filter(n -> n.getParent() == null || !trashIds.contains(n.getParent().getId()))
                .toList();
        for (Note root : roots) {
            hardDeleteRecursive(root);
        }
        return trash.size();
    }

    @Transactional
    public NoteResponse.Detail moveNote(String noteId, String userId, NoteRequest.Move request) {
        Note note = getNoteOrThrow(noteId, userId);
        Note newParent = null;
        int newDepth = 0;

        if (request.getParentId() != null) {
            newParent = getNoteOrThrow(request.getParentId(), userId);
            if (isDescendant(note.getId(), request.getParentId())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "하위 폴더로 이동할 수 없습니다");
            }
            newDepth = newParent.getDepth() + 1;
            int maxChildDepth = getMaxDescendantDepth(note);
            int depthDelta = maxChildDepth - note.getDepth();
            if (newDepth + depthDelta > Note.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "이동 시 깊이가 5단계를 초과합니다");
            }
        }

        List<Note> siblings = (newParent != null)
                ? noteRepository.findChildrenByParentId(newParent.getId())
                : noteRepository.findRootsByOwnerUserId(userId);
        siblings.removeIf(n -> n.getId().equals(noteId));

        int index = request.getPosition() != null
                ? Math.max(0, Math.min(request.getPosition(), siblings.size()))
                : siblings.size();

        note.moveTo(newParent, index);
        siblings.add(index, note);
        for (int i = 0; i < siblings.size(); i++) {
            if (siblings.get(i).getPosition() != i) {
                siblings.get(i).updatePosition(i);
            }
        }
        updateDescendantDepths(note);

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    // ===== Version =====

    public List<NoteResponse.VersionInfo> getVersions(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);

        return noteVersionRepository.findAllByNoteIdOrderByVersionNumberDesc(noteId)
                .stream()
                .map(NoteResponse.VersionInfo::of)
                .toList();
    }

    public NoteResponse.VersionDetail getVersionDetail(String noteId, String versionId, String userId) {
        getNoteOrThrow(noteId, userId);

        NoteVersion version = noteVersionRepository.findByIdAndNoteId(versionId, noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_VERSION_NOT_FOUND));

        return NoteResponse.VersionDetail.of(version);
    }

    @Retryable(retryFor = DataIntegrityViolationException.class,
               maxAttempts = 3,
               backoff = @Backoff(delay = 50, multiplier = 2.0))
    @Transactional
    public NoteResponse.Detail restoreVersion(String noteId, String versionId, String userId,
                                              NoteRequest.RestoreVersion request) {
        Note note = getNoteOrThrow(noteId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        NoteVersion version = noteVersionRepository.findByIdAndNoteId(versionId, noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_VERSION_NOT_FOUND));

        String snapshotTitle = request != null && request.getCurrentTitle() != null
                ? request.getCurrentTitle() : note.getTitle();
        String snapshotContent = request != null && request.getCurrentContent() != null
                ? request.getCurrentContent() : note.getContent();

        boolean snapshotDiffers = !Objects.equals(snapshotTitle, version.getTitle())
                || !Objects.equals(snapshotContent, version.getContent());
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        if (snapshotDiffers) {
            versionCount = versionCount + 1;
            NoteVersion currentSnapshot = NoteVersion.create(note, snapshotTitle, snapshotContent, user, versionCount);
            noteVersionRepository.save(currentSnapshot);
        }

        note.updateTitle(version.getTitle());
        note.updateContent(version.getContent(), user);

        noteCollabService.deleteState(noteId);
        eventPublisher.publishEvent(new NoteDraftDiscardedEvent(noteId));
        eventPublisher.publishEvent(new NoteSnapshotSavedEvent(noteId));

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount, false);
    }

    @Transactional
    public void deleteVersion(String noteId, String versionId, String userId) {
        getNoteOrThrow(noteId, userId);

        NoteVersion version = noteVersionRepository.findByIdAndNoteId(versionId, noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_VERSION_NOT_FOUND));

        noteVersionRepository.delete(version);
    }

    @Transactional
    public void deleteAllVersions(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);

        noteVersionRepository.deleteAllByNoteId(noteId);
    }

    @Transactional
    public void discardDraft(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);
        noteCollabService.discardDraft(noteId, userId);
        eventPublisher.publishEvent(new NoteDraftDiscardedEvent(noteId));
    }

    @Transactional
    public void restoreDraft(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);
        if (noteCollabService.restoreDraft(noteId)) {
            eventPublisher.publishEvent(new NoteDraftRestoredEvent(noteId));
        }
    }

    @Transactional(readOnly = true)
    public boolean hasArchivedDraft(String noteId, String userId) {
        getNoteOrThrow(noteId, userId);
        return noteCollabService.hasArchivedDraft(noteId);
    }

    // ===== Tags =====

    public List<NoteResponse.TagInfo> getTags(String userId) {
        return noteTagRepository.findAllByOwnerIdOrderByNameAsc(userId)
                .stream()
                .map(NoteResponse.TagInfo::of)
                .toList();
    }

    @Transactional
    public NoteResponse.TagInfo createTag(String userId, String name, String color) {
        if (noteTagRepository.existsByOwnerIdAndName(userId, name)) {
            throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        NoteTag tag = NoteTag.builder()
                .owner(user)
                .name(name)
                .color(color)
                .build();

        noteTagRepository.save(tag);
        return NoteResponse.TagInfo.of(tag);
    }

    @Transactional
    public void deleteTag(String tagId, String userId) {
        NoteTag tag = noteTagRepository.findById(tagId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (tag.getOwner() == null || !tag.getOwner().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.TAG_NOT_FOUND);
        }

        noteTagRepository.delete(tag);
    }

    // ===== Sharing =====

    @Transactional
    public NoteResponse.Detail enableShare(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        if (note.isFolder()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더는 공유할 수 없습니다");
        }
        note.enableShare();

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public NoteResponse.Detail disableShare(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        note.disableShare();

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public NoteResponse.Detail rotateShareToken(String noteId, String userId) {
        Note note = getNoteOrThrow(noteId, userId);
        if (note.isFolder()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더는 공유할 수 없습니다");
        }
        note.rotateShareToken();

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    // ===== Helper Methods =====

    private Note getNoteOrThrow(String noteId, String userId) {
        Note note = noteRepository.findByIdAndOwnerUserId(noteId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
        if (note.getIsDeleted()) {
            throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
        }
        return note;
    }

    private NoteResponse.TreeItem buildTreeItem(Note note, Map<String, List<Note>> childrenMap, Map<String, List<NoteResponse.TagInfo>> tagMap) {
        List<NoteResponse.TreeItem> children = childrenMap.getOrDefault(note.getId(), List.of())
                .stream()
                .sorted(Comparator.comparingInt(Note::getPosition))
                .map(child -> buildTreeItem(child, childrenMap, tagMap))
                .toList();

        return NoteResponse.TreeItem.of(
                note,
                tagMap.getOrDefault(note.getId(), List.of()),
                children
        );
    }

    private Map<String, List<NoteResponse.TagInfo>> getTagMapForNotes(List<String> noteIds) {
        if (noteIds.isEmpty()) return Map.of();

        List<NoteTagMapping> mappings = noteTagMappingRepository.findAllByNoteIdsWithTag(noteIds);

        return mappings.stream()
                .collect(Collectors.groupingBy(
                        m -> m.getNote().getId(),
                        Collectors.mapping(m -> NoteResponse.TagInfo.of(m.getTag()), Collectors.toList())
                ));
    }

    private List<NoteResponse.TagInfo> getTagsForNote(String noteId) {
        return noteTagMappingRepository.findAllByNoteIdWithTag(noteId)
                .stream()
                .map(m -> NoteResponse.TagInfo.of(m.getTag()))
                .toList();
    }

    private void syncNoteTags(Note note, List<String> tagIds) {
        for (String tagId : tagIds) {
            NoteTag tag = noteTagRepository.findById(tagId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));
            if (!noteTagMappingRepository.existsByNoteIdAndTagId(note.getId(), tagId)) {
                NoteTagMapping mapping = NoteTagMapping.builder()
                        .note(note)
                        .tag(tag)
                        .build();
                noteTagMappingRepository.save(mapping);
            }
        }
    }

    private void softDeleteRecursive(Note note, User actor) {
        note.softDelete(actor);
        List<Note> children = noteRepository.findChildrenByParentId(note.getId());
        for (Note child : children) {
            softDeleteRecursive(child, actor);
        }
    }

    private void restoreRecursive(Note note) {
        note.restore();
        List<Note> children = noteRepository.findAllChildrenIncludingDeleted(note.getId());
        for (Note child : children) {
            if (!Boolean.TRUE.equals(child.getIsDeleted())) continue;
            child.moveTo(note, child.getPosition());
            restoreRecursive(child);
        }
    }

    private void hardDeleteRecursive(Note note) {
        List<Note> children = noteRepository.findAllChildrenIncludingDeleted(note.getId());
        for (Note child : children) {
            hardDeleteRecursive(child);
        }
        noteLikeRepository.deleteByNoteId(note.getId());
        noteCommentReactionRepository.deleteByNoteId(note.getId());
        noteCommentRepository.deleteByNoteId(note.getId());
        noteTagMappingRepository.deleteAllByNoteId(note.getId());
        noteVersionRepository.deleteAllByNoteId(note.getId());
        noteCollabStateRepository.deleteById(note.getId());
        noteDraftArchiveRepository.deleteById(note.getId());
        noteRepository.delete(note);
    }

    private boolean isDescendant(String ancestorId, String targetId) {
        if (ancestorId.equals(targetId)) return true;
        List<Note> children = noteRepository.findChildrenByParentId(ancestorId);
        for (Note child : children) {
            if (isDescendant(child.getId(), targetId)) return true;
        }
        return false;
    }

    private int getMaxDescendantDepth(Note note) {
        List<Note> children = noteRepository.findChildrenByParentId(note.getId());
        if (children.isEmpty()) return note.getDepth();
        return children.stream()
                .mapToInt(this::getMaxDescendantDepth)
                .max()
                .orElse(note.getDepth());
    }

    private void updateDescendantDepths(Note parent) {
        List<Note> children = noteRepository.findChildrenByParentId(parent.getId());
        for (Note child : children) {
            child.moveTo(parent, child.getPosition());
            updateDescendantDepths(child);
        }
    }
}
