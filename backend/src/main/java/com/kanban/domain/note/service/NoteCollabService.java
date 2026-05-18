package com.kanban.domain.note.service;

import com.kanban.domain.note.NoteCollabState;
import com.kanban.domain.note.NoteCollabStateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class NoteCollabService {

    private final NoteCollabStateRepository repository;

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

    @Transactional
    public void deleteState(String noteId) {
        repository.deleteById(noteId);
    }
}
