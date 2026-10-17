package com.kanban.domain.note.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.service.NoteCollabAccessService.Access;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NoteCollabAccessServiceTest {

    private static final String NOTE = "note-1";
    private static final String USER = "user-1";
    private static final String BOARD = "board-1";
    private static final String ORG = "org-1";

    @Mock NoteRepository noteRepository;
    @Mock BoardService boardService;
    @Mock OrgMemberRepository orgMemberRepository;

    @InjectMocks NoteCollabAccessService service;

    @Test
    void unknownNote_isDenied() {
        when(noteRepository.findById(NOTE)).thenReturn(Optional.empty());
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.NONE);
    }

    @Test
    void deletedNote_isDenied() {
        Note note = mock(Note.class);
        when(note.getIsDeleted()).thenReturn(true);
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.NONE);
    }

    @Test
    void boardMember_canEdit() {
        Note note = boardNote();
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.EDIT);
    }

    @Test
    void boardViewer_canOnlyView() {
        Note note = boardNote();
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        doThrow(new BusinessException(ErrorCode.BOARD_ACCESS_DENIED))
                .when(boardService).checkMemberOrAbove(eq(BOARD), eq(USER));
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.VIEW);
    }

    @Test
    void nonBoardMember_isDenied() {
        Note note = boardNote();
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        doThrow(new BusinessException(ErrorCode.BOARD_ACCESS_DENIED))
                .when(boardService).checkMemberOrAbove(eq(BOARD), eq(USER));
        doThrow(new BusinessException(ErrorCode.BOARD_ACCESS_DENIED))
                .when(boardService).checkViewerOrAbove(eq(BOARD), eq(USER));
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.NONE);
    }

    @Test
    void orgMember_canEdit_andOutsiderDenied() {
        Note note = orgNote();
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(true);
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.EDIT);

        when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(false);
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.NONE);
    }

    @Test
    void personalNote_onlyOwnerCanEdit() {
        Note note = personalNote(USER);
        when(noteRepository.findById(NOTE)).thenReturn(Optional.of(note));
        assertThat(service.resolve(NOTE, USER)).isEqualTo(Access.EDIT);
        assertThat(service.resolve(NOTE, "someone-else")).isEqualTo(Access.NONE);
    }

    private static Note boardNote() {
        Note note = mock(Note.class);
        Board board = mock(Board.class);
        when(board.getId()).thenReturn(BOARD);
        when(note.getBoard()).thenReturn(board);
        return note;
    }

    private static Note orgNote() {
        Note note = mock(Note.class);
        Organization org = mock(Organization.class);
        when(org.getId()).thenReturn(ORG);
        when(note.getOrganization()).thenReturn(org);
        return note;
    }

    private static Note personalNote(String ownerId) {
        Note note = mock(Note.class);
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(ownerId);
        when(note.getOwner()).thenReturn(owner);
        return note;
    }
}
