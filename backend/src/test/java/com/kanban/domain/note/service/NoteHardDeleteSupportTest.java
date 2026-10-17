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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 서비스(영구 삭제·휴지통 비우기)와 스케줄러(30일 만료)가 공유하는 하드 삭제 경로가
 * note_likes / note_draft_archives 까지 포함해 모든 종속 행을 지우는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("NoteHardDeleteSupport")
class NoteHardDeleteSupportTest {

    @Mock NoteRepository noteRepository;
    @Mock NoteLikeRepository noteLikeRepository;
    @Mock NoteCommentReactionRepository noteCommentReactionRepository;
    @Mock NoteCommentRepository noteCommentRepository;
    @Mock NoteTagMappingRepository noteTagMappingRepository;
    @Mock NoteVersionRepository noteVersionRepository;
    @Mock NoteCollabStateRepository noteCollabStateRepository;
    @Mock NoteDraftArchiveRepository noteDraftArchiveRepository;

    @InjectMocks NoteHardDeleteSupport support;

    private static Note noteWithId(String id) {
        Note n = mock(Note.class);
        when(n.getId()).thenReturn(id);
        return n;
    }

    @Test
    @DisplayName("좋아요·드래프트 아카이브를 포함한 모든 종속 행을 노트보다 먼저 지운다")
    void deletesEveryDependentBeforeNote() {
        Note note = noteWithId("n1");
        when(noteRepository.findAllChildrenIncludingDeleted("n1")).thenReturn(List.of());

        int count = support.hardDeleteRecursive(note);

        assertThat(count).isEqualTo(1);
        InOrder order = inOrder(noteLikeRepository, noteCommentReactionRepository, noteCommentRepository,
                noteTagMappingRepository, noteVersionRepository, noteCollabStateRepository,
                noteDraftArchiveRepository, noteRepository);
        order.verify(noteLikeRepository).deleteByNoteId("n1");
        order.verify(noteCommentReactionRepository).deleteByNoteId("n1");
        order.verify(noteCommentRepository).deleteByNoteId("n1");
        order.verify(noteTagMappingRepository).deleteAllByNoteId("n1");
        order.verify(noteVersionRepository).deleteAllByNoteId("n1");
        order.verify(noteCollabStateRepository).deleteById("n1");
        order.verify(noteDraftArchiveRepository).deleteById("n1");
        order.verify(noteRepository).delete(note);
    }

    @Test
    @DisplayName("자손(삭제 여부 무관)을 먼저 지우고 개수를 합산한다")
    void recursesIntoChildrenAndCounts() {
        Note root = noteWithId("root");
        Note child = noteWithId("child");
        Note grandchild = noteWithId("grandchild");
        when(noteRepository.findAllChildrenIncludingDeleted("root")).thenReturn(List.of(child));
        when(noteRepository.findAllChildrenIncludingDeleted("child")).thenReturn(List.of(grandchild));
        when(noteRepository.findAllChildrenIncludingDeleted("grandchild")).thenReturn(List.of());

        int count = support.hardDeleteRecursive(root);

        assertThat(count).isEqualTo(3);
        InOrder order = inOrder(noteRepository);
        order.verify(noteRepository).delete(grandchild);
        order.verify(noteRepository).delete(child);
        order.verify(noteRepository).delete(root);
        verify(noteLikeRepository).deleteByNoteId("grandchild");
        verify(noteLikeRepository).deleteByNoteId("child");
        verify(noteLikeRepository).deleteByNoteId("root");
    }
}
