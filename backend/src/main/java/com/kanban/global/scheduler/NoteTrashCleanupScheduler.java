package com.kanban.global.scheduler;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteCollabStateRepository;
import com.kanban.domain.note.NoteCommentReactionRepository;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.NoteTagMappingRepository;
import com.kanban.domain.note.NoteVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 휴지통에 30일 이상 머문 노트를 영구 삭제한다.
 * Daily 03:00 UTC.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NoteTrashCleanupScheduler {

    private static final int RETENTION_DAYS = 30;

    private final NoteRepository noteRepository;
    private final NoteCommentRepository noteCommentRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteTagMappingRepository noteTagMappingRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final NoteCollabStateRepository noteCollabStateRepository;

    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    @Transactional
    public void cleanupExpiredTrash() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(RETENTION_DAYS);
        List<Note> expired = noteRepository.findExpiredTrash(cutoff);
        if (expired.isEmpty()) {
            log.debug("No expired trash notes to clean up");
            return;
        }
        log.info("NoteTrashCleanup: deleting {} expired notes (cutoff={})", expired.size(), cutoff);

        // 부모도 만료 대상이면 부모쪽에서 cascade 처리 → 서브트리 루트만 직접 호출
        Set<String> expiredIds = expired.stream().map(Note::getId).collect(Collectors.toSet());
        List<Note> roots = expired.stream()
                .filter(n -> n.getParent() == null || !expiredIds.contains(n.getParent().getId()))
                .toList();

        int deleted = 0;
        for (Note root : roots) {
            deleted += hardDeleteSubtree(root);
        }
        log.info("NoteTrashCleanup: permanently deleted {} notes ({}+ days old)", deleted, RETENTION_DAYS);
    }

    private int hardDeleteSubtree(Note note) {
        int count = 1;
        List<Note> children = noteRepository.findAllChildrenIncludingDeleted(note.getId());
        for (Note child : children) {
            count += hardDeleteSubtree(child);
        }
        noteCommentReactionRepository.deleteByNoteId(note.getId());
        noteCommentRepository.deleteByNoteId(note.getId());
        noteTagMappingRepository.deleteAllByNoteId(note.getId());
        noteVersionRepository.deleteAllByNoteId(note.getId());
        noteCollabStateRepository.deleteById(note.getId());
        noteRepository.delete(note);
        return count;
    }
}
