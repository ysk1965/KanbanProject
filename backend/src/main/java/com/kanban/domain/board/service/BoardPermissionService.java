package com.kanban.domain.board.service;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 보드 권한 체크의 단일 진입점. 판정은 캐시된 {@link BoardAccess} 위의 순수 계산이라 캐시 히트 시 DB 를 안 본다.
 *
 * <p>판정 규칙은 {@link BoardAccess} 참고. {@code BoardService.check*} 는 이 클래스로 위임하는 {@code @Deprecated}
 * 껍데기만 남아 있다 — 새 코드는 이 서비스를 직접 쓴다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardPermissionService {

    private final BoardAccessResolver resolver;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;

    public BoardAccess access(String boardId, String userId) {
        return resolver.resolve(boardId, userId);
    }

    // ── boolean 판정 ──

    public boolean isViewerOrAbove(String boardId, String userId) {
        return access(boardId, userId).isViewerOrAbove();
    }

    public boolean isMemberOrAbove(String boardId, String userId) {
        return access(boardId, userId).isMemberOrAbove();
    }

    public boolean isAdminOrAbove(String boardId, String userId) {
        return access(boardId, userId).isAdminOrAbove();
    }

    public boolean isOwner(String boardId, String userId) {
        return access(boardId, userId).isOwner();
    }

    /** 명시적 board_members 역할. 조직 폴백·시스템 ADMIN 은 포함하지 않는다. */
    public Optional<BoardRole> explicitRole(String boardId, String userId) {
        return Optional.ofNullable(access(boardId, userId).explicitRole());
    }

    // ── throwing 체크 (BOARD_ACCESS_DENIED) ──

    public void checkViewerOrAbove(String boardId, String userId) {
        if (!isViewerOrAbove(boardId, userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    public void checkMemberOrAbove(String boardId, String userId) {
        if (!isMemberOrAbove(boardId, userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    public void checkAdminOrAbove(String boardId, String userId) {
        if (!isAdminOrAbove(boardId, userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    public void checkOwner(String boardId, String userId) {
        if (!isOwner(boardId, userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
    }

    /**
     * 명시적 멤버십 엔티티가 필요할 때(assigneeColor 등 필드 접근). 캐시를 거치지 않는다 — 엔티티 자체가 필요한
     * 호출자는 어차피 행을 읽어야 한다.
     */
    public BoardMember membershipOrThrow(String boardId, String userId) {
        return boardMemberRepository
                .findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));
    }

    /**
     * Personal Board 에서 팀 전용 기능(초대 등) 접근 시 차단. 사용자와 무관한 보드 타입 체크라 접근 캐시에 넣지 않고
     * 보드를 직접 본다(호출 지점 8곳).
     */
    public void checkTeamBoardOnly(String boardId) {
        boardRepository.findById(boardId).ifPresent(board -> {
            if (board.isPersonal()) {
                throw new BusinessException(ErrorCode.PERSONAL_BOARD_NO_INVITE);
            }
        });
    }
}
