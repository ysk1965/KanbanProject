package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteCollabStateRepository;
import com.kanban.domain.note.NoteCommentReactionRepository;
import com.kanban.domain.note.NoteCommentRepository;
import com.kanban.domain.note.NoteDraftArchiveRepository;
import com.kanban.domain.note.NoteLikeRepository;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.NoteTagMappingRepository;
import com.kanban.domain.note.NoteVersionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 노트 서브트리 영구 삭제의 단일 진입점.
 *
 * <p>보드/조직/개인 서비스의 "영구 삭제·휴지통 비우기" 와 {@code NoteTrashCleanupScheduler} 의
 * 30일 만료 정리가 모두 이 컴포넌트를 쓴다. 종속 행을 지우는 순서가 한 곳에만 있으므로
 * 두 경로가 어긋나 FK 위반(예: note_likes 누락)이 나는 일이 없다.
 *
 * <p>호출자가 트랜잭션을 연다 (이 클래스는 @Transactional 을 선언하지 않는다).
 */
@Component
@RequiredArgsConstructor
public class NoteHardDeleteSupport {

    private final NoteRepository noteRepository;
    private final NoteLikeRepository noteLikeRepository;
    private final NoteCommentReactionRepository noteCommentReactionRepository;
    private final NoteCommentRepository noteCommentRepository;
    private final NoteTagMappingRepository noteTagMappingRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final NoteCollabStateRepository noteCollabStateRepository;
    private final NoteDraftArchiveRepository noteDraftArchiveRepository;

    /**
     * 노트와 모든 자손(삭제 여부 무관)을 영구 삭제한다.
     *
     * @return 삭제된 노트 수 (자기 자신 포함)
     */
    public int hardDeleteRecursive(Note note) {
        int count = 1;
        List<Note> children = noteRepository.findAllChildrenIncludingDeleted(note.getId());
        for (Note child : children) {
            count += hardDeleteRecursive(child);
        }
        deleteDependents(note.getId());
        noteRepository.delete(note);
        return count;
    }

    /** 노트 한 건의 종속 데이터를 지운다 (likes → reactions → comments → tag mappings → versions → collab → draft archive). */
    void deleteDependents(String noteId) {
        noteLikeRepository.deleteByNoteId(noteId);
        noteCommentReactionRepository.deleteByNoteId(noteId);
        noteCommentRepository.deleteByNoteId(noteId);
        noteTagMappingRepository.deleteAllByNoteId(noteId);
        noteVersionRepository.deleteAllByNoteId(noteId);
        noteCollabStateRepository.deleteById(noteId);
        noteDraftArchiveRepository.deleteById(noteId);
    }
}
