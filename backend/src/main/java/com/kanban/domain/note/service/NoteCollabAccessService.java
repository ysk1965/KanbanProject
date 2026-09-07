package com.kanban.domain.note.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 협업 WebSocket(/ws-collab/{noteId}) 접속자의 노트 접근 권한을 판정한다.
 *
 * REST 계층과 동일한 규칙을 적용한다:
 *  - 보드 노트: viewer 이상 → VIEW, member 이상 → EDIT ({@link NoteService} 와 동일)
 *  - 조직 노트: 조직 멤버 → EDIT ({@link OrgNoteService} 와 동일)
 *  - 개인 노트: 소유자만 EDIT ({@link MyNoteService} 와 동일)
 *  - 삭제된 노트 / 존재하지 않는 노트 → NONE
 */
@Service
@RequiredArgsConstructor
public class NoteCollabAccessService {

    public enum Access {
        NONE, VIEW, EDIT;

        public boolean canView() {
            return this != NONE;
        }

        public boolean canEdit() {
            return this == EDIT;
        }
    }

    private final NoteRepository noteRepository;
    private final BoardService boardService;
    private final OrgMemberRepository orgMemberRepository;

    @Transactional(readOnly = true)
    public Access resolve(String noteId, String userId) {
        if (noteId == null || userId == null) return Access.NONE;

        Note note = noteRepository.findById(noteId).orElse(null);
        if (note == null || Boolean.TRUE.equals(note.getIsDeleted())) {
            return Access.NONE;
        }

        if (note.getBoard() != null) {
            String boardId = note.getBoard().getId();
            if (passes(() -> boardService.checkMemberOrAbove(boardId, userId))) {
                return Access.EDIT;
            }
            if (passes(() -> boardService.checkViewerOrAbove(boardId, userId))) {
                return Access.VIEW;
            }
            return Access.NONE;
        }

        if (note.getOrganization() != null) {
            String orgId = note.getOrganization().getId();
            return orgMemberRepository.existsByOrganizationIdAndUserId(orgId, userId)
                    ? Access.EDIT : Access.NONE;
        }

        if (note.getOwner() != null) {
            return userId.equals(note.getOwner().getId()) ? Access.EDIT : Access.NONE;
        }

        return Access.NONE;
    }

    private static boolean passes(Runnable check) {
        try {
            check.run();
            return true;
        } catch (BusinessException e) {
            return false;
        }
    }
}
