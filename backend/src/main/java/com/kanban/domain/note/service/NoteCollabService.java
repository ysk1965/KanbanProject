package com.kanban.domain.note.service;

import com.kanban.domain.note.NoteCollabState;
import com.kanban.domain.note.NoteCollabStateRepository;
import com.kanban.domain.note.NoteDraftArchive;
import com.kanban.domain.note.NoteDraftArchiveRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class NoteCollabService {

    private final NoteCollabStateRepository repository;
    private final NoteDraftArchiveRepository archiveRepository;

    @Transactional(readOnly = true)
    public Optional<byte[]> loadState(String noteId) {
        return repository.findById(noteId)
                .map(NoteCollabState::getYjsState);
    }

    /**
     * True when a collab draft has been written after the last published save.
     * Used to show the "unpublished changes" banner on view mode.
     */
    @Transactional(readOnly = true)
    public boolean hasUnpublishedDraft(String noteId, LocalDateTime publishedAt) {
        if (publishedAt == null) return false;
        return repository.findById(noteId)
                .map(state -> state.getYjsState() != null
                        && state.getYjsState().length > 0
                        && state.getUpdatedAt().isAfter(publishedAt))
                .orElse(false);
    }

    @Transactional
    public void saveState(String noteId, byte[] state) {
        NoteCollabState collabState = repository.findById(noteId)
                .orElse(NoteCollabState.builder()
                        .noteId(noteId)
                        .build());
        collabState.updateState(state);
        repository.save(collabState);
    }

    /**
     * Publish cleanup: remove the live draft AND any restorable discard archive
     * (a publish supersedes an earlier discard, so a stale "되돌리기" must not be
     * offered over fresh published content).
     *
     * Idempotent — silently no-op if no row exists. Spring Data JPA's default
     * deleteById throws EmptyResultDataAccessException on a missing row, which
     * would 500 the save/publish path on a double-click or race.
     */
    @Transactional
    public void deleteState(String noteId) {
        repository.findById(noteId).ifPresent(repository::delete);
        archiveRepository.findById(noteId).ifPresent(archiveRepository::delete);
    }

    /**
     * User-initiated discard (폐기): preserve the current draft as a restorable
     * archive (one per note, latest wins) BEFORE removing the live draft, so the
     * destructive action is undoable. Java holds the Yjs state as an opaque blob
     * (no server-side CRDT), so the raw bytes are archived verbatim.
     *
     * Idempotent — no-op if there is no live draft to discard.
     */
    @Transactional
    public void discardDraft(String noteId, String userId) {
        repository.findById(noteId).ifPresent(live -> {
            byte[] state = live.getYjsState();
            if (state != null && state.length > 0) {
                NoteDraftArchive archive = archiveRepository.findById(noteId)
                        .orElse(NoteDraftArchive.builder().noteId(noteId).build());
                archive.replace(state, userId);
                archiveRepository.save(archive);
            }
            repository.delete(live);
        });
    }

    /**
     * Restore a previously discarded draft back into the live collab state.
     * Returns false (no-op) when there is nothing to restore, or when a live
     * draft already exists — restoring would clobber newer in-progress work.
     * On success the archive is consumed.
     */
    @Transactional
    public boolean restoreDraft(String noteId) {
        if (repository.existsById(noteId)) return false; // live draft present — don't clobber
        return archiveRepository.findById(noteId).map(archive -> {
            byte[] state = archive.getYjsState();
            archiveRepository.delete(archive);
            if (state == null || state.length == 0) return false;
            NoteCollabState live = NoteCollabState.builder().noteId(noteId).build();
            live.updateState(state);
            repository.save(live);
            return true;
        }).orElse(false);
    }

    /**
     * True when a restorable discard archive exists AND there is no live draft
     * (restore is only meaningful then — otherwise it would clobber newer work).
     */
    @Transactional(readOnly = true)
    public boolean hasArchivedDraft(String noteId) {
        if (repository.existsById(noteId)) return false;
        return archiveRepository.findById(noteId)
                .map(a -> a.getYjsState() != null && a.getYjsState().length > 0)
                .orElse(false);
    }
}
