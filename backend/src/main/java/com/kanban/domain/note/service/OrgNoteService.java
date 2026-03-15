package com.kanban.domain.note.service;

import com.kanban.domain.note.*;
import com.kanban.domain.note.dto.NoteRequest;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
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

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgNoteService {

    private final NoteRepository noteRepository;
    private final NoteTagRepository noteTagRepository;
    private final NoteTagMappingRepository noteTagMappingRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;

    // ===== Note CRUD =====

    public List<NoteResponse.TreeItem> getNoteTree(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<Note> allNotes = noteRepository.findAllByOrganizationIdNotDeleted(orgId);
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

    public List<NoteResponse.ListItem> getNoteList(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<Note> documents = noteRepository.findAllDocumentsAndBoardsByOrganizationId(orgId);
        List<String> noteIds = documents.stream().map(Note::getId).toList();
        Map<String, List<NoteResponse.TagInfo>> tagMap = getTagMapForNotes(noteIds);

        return documents.stream()
                .map(note -> {
                    String parentTitle = note.getParent() != null ? note.getParent().getTitle() : null;
                    return NoteResponse.ListItem.of(note, parentTitle, tagMap.getOrDefault(note.getId(), List.of()));
                })
                .toList();
    }

    public NoteResponse.Detail getNoteDetail(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);

        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public NoteResponse.Detail createNote(String orgId, String userId, NoteRequest.Create request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));

        NoteType type = NoteType.valueOf(request.getType());
        Note parent = null;
        int depth = 0;
        int position;

        if (request.getParentId() != null) {
            parent = getNoteOrThrow(orgId, request.getParentId());
            depth = parent.getDepth() + 1;
            if (depth > Note.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더 깊이는 최대 5단계입니다");
            }
            position = noteRepository.findNextChildPosition(parent.getId());
        } else {
            position = noteRepository.findNextRootPositionByOrganizationId(orgId);
        }

        Note note = Note.builder()
                .organization(org)
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

    @Transactional
    public NoteResponse.Detail updateNote(String orgId, String noteId, String userId,
                                           NoteRequest.Update request, boolean createVersion) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);

        if (createVersion) {
            versionCount = versionCount + 1;
            NoteVersion version = NoteVersion.createFrom(note, user, versionCount);
            noteVersionRepository.save(version);
        }

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
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public void deleteNote(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        Note note = getNoteOrThrow(orgId, noteId);
        softDeleteRecursive(note);
    }

    @Transactional
    public NoteResponse.Detail moveNote(String orgId, String noteId, String userId, NoteRequest.Move request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        Note newParent = null;
        int newDepth = 0;

        if (request.getParentId() != null) {
            newParent = getNoteOrThrow(orgId, request.getParentId());
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

        int position = request.getPosition() != null ? request.getPosition() :
                (newParent != null ? noteRepository.findNextChildPosition(newParent.getId()) : noteRepository.findNextRootPositionByOrganizationId(orgId));

        note.moveTo(newParent, position);
        updateDescendantDepths(note);

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    // ===== Version =====

    public List<NoteResponse.VersionInfo> getVersions(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        getNoteOrThrow(orgId, noteId);

        return noteVersionRepository.findAllByNoteIdOrderByVersionNumberDesc(noteId)
                .stream()
                .map(NoteResponse.VersionInfo::of)
                .toList();
    }

    public NoteResponse.VersionDetail getVersionDetail(String orgId, String noteId, String versionId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        getNoteOrThrow(orgId, noteId);

        NoteVersion version = noteVersionRepository.findByIdAndNoteId(versionId, noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_VERSION_NOT_FOUND));

        return NoteResponse.VersionDetail.of(version);
    }

    @Transactional
    public NoteResponse.Detail restoreVersion(String orgId, String noteId, String versionId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        NoteVersion version = noteVersionRepository.findByIdAndNoteId(versionId, noteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTE_VERSION_NOT_FOUND));

        int nextVersion = noteVersionRepository.findMaxVersionNumber(noteId) + 1;
        NoteVersion currentSnapshot = NoteVersion.createFrom(note, user, nextVersion);
        noteVersionRepository.save(currentSnapshot);

        note.updateTitle(version.getTitle());
        note.updateContent(version.getContent(), user);

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        return NoteResponse.Detail.of(note, tags, nextVersion);
    }

    // ===== Tags =====

    public List<NoteResponse.TagInfo> getTags(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        return noteTagRepository.findAllByOrganizationIdOrderByNameAsc(orgId)
                .stream()
                .map(NoteResponse.TagInfo::of)
                .toList();
    }

    @Transactional
    public NoteResponse.TagInfo createTag(String orgId, String userId, String name, String color) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        if (noteTagRepository.existsByOrganizationIdAndName(orgId, name)) {
            throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
        }

        Organization org = organizationRepository.findById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));

        NoteTag tag = NoteTag.builder()
                .organization(org)
                .name(name)
                .color(color)
                .build();

        noteTagRepository.save(tag);
        return NoteResponse.TagInfo.of(tag);
    }

    @Transactional
    public void deleteTag(String orgId, String tagId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        NoteTag tag = noteTagRepository.findById(tagId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (tag.getOrganization() == null || !tag.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ACCESS_DENIED);
        }

        noteTagRepository.delete(tag);
    }

    // ===== Sharing =====

    @Transactional
    public NoteResponse.Detail enableShare(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        if (note.isFolder()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더는 공유할 수 없습니다");
        }
        note.enableShare();

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    @Transactional
    public NoteResponse.Detail disableShare(String orgId, String noteId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Note note = getNoteOrThrow(orgId, noteId);
        note.disableShare();

        List<NoteResponse.TagInfo> tags = getTagsForNote(noteId);
        int versionCount = noteVersionRepository.findMaxVersionNumber(noteId);
        return NoteResponse.Detail.of(note, tags, versionCount);
    }

    // ===== Helper Methods =====

    private Note getNoteOrThrow(String orgId, String noteId) {
        Note note = noteRepository.findByIdAndOrganizationId(noteId, orgId)
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

    private void softDeleteRecursive(Note note) {
        note.softDelete();
        List<Note> children = noteRepository.findChildrenByParentId(note.getId());
        for (Note child : children) {
            softDeleteRecursive(child);
        }
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
