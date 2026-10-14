package com.kanban.domain.board.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * (boardId, userId) → {@link BoardAccess}. 캐시 미스일 때만 DB 를 본다.
 *
 * <p>쿼리 수: 명시적 멤버십이 있으면 1개(멤버십 행). 없으면 최대 4개(멤버십, 사용자 systemRole, 보드+조직,
 * 조직 멤버십). 명시적 역할이 있으면 나머지 정보는 어떤 판정에도 쓰이지 않으므로 조회하지 않는다.
 *
 * <p>캐시는 {@code @Cacheable} 대신 {@link BoardAccessCache} 로 직접 다룬다 — Redis 캐시 매니저가
 * transactionAware 라 어노테이션 방식은 put 이 커밋 뒤로 밀려 같은 트랜잭션 안의 반복 체크가 전부 미스가 되고,
 * 자기 호출(self-invocation) 문제도 함께 사라진다.
 */
@Service
@RequiredArgsConstructor
public class BoardAccessResolver {

    private final BoardAccessCache cache;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BoardRepository boardRepository;
    private final OrgMemberRepository orgMemberRepository;

    @Transactional(readOnly = true)
    public BoardAccess resolve(String boardId, String userId) {
        Optional<BoardAccess> cached = cache.get(boardId, userId);
        if (cached.isPresent()) {
            return cached.get();
        }
        BoardAccess access = load(boardId, userId);
        cache.put(boardId, userId, access);
        return access;
    }

    /** 캐시를 거치지 않는 순수 조회 (테스트·디버깅용). */
    @Transactional(readOnly = true)
    public BoardAccess load(String boardId, String userId) {
        Optional<BoardMember> membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId);
        if (membership.isPresent()) {
            return BoardAccess.explicit(membership.get().getRole());
        }

        boolean systemAdmin = userRepository.findById(userId).map(User::isAdmin).orElse(false);

        Board board = boardRepository.findById(boardId).orElse(null);
        if (board == null || !board.isOrganizationBoard()) {
            return new BoardAccess(null, systemAdmin, false, false, false);
        }

        Organization org = board.getOrganization();
        boolean orgMember = orgMemberRepository.existsByOrganizationIdAndUserId(org.getId(), userId);
        boolean autoBoardAccess = Boolean.TRUE.equals(org.getAutoBoardAccessEnabled());
        return new BoardAccess(null, systemAdmin, true, orgMember, autoBoardAccess);
    }
}
