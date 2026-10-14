package com.kanban.domain.board.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 엔티티 리스너 → 이벤트 → 캐시 무효화 경로를 실제 JPA(H2) + simple 캐시로 검증한다.
 * 각 변경은 별도 트랜잭션으로 커밋하고, 커밋 뒤의 권한 판정이 새 상태를 반영하는지 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("boardAccess 캐시 — 엔티티 변경 시 자동 무효화 (H2)")
class BoardAccessInvalidationIntegrationTest {

    @Autowired
    BoardPermissionService permissionService;

    @Autowired
    BoardAccessCache cache;

    @Autowired
    TransactionTemplate tx;

    @Autowired
    UserRepository userRepository;

    @Autowired
    BoardRepository boardRepository;

    @Autowired
    BoardMemberRepository boardMemberRepository;

    @Autowired
    OrganizationRepository organizationRepository;

    @Autowired
    OrgMemberRepository orgMemberRepository;

    private User newUser() {
        return userRepository.save(User.builder()
                .email(UUID.randomUUID() + "@test.local")
                .name("tester")
                .build());
    }

    private Board newBoard(User owner, Organization org) {
        return boardRepository.save(
                Board.builder().name("b").owner(owner).organization(org).build());
    }

    private BoardMember newMember(Board board, User user, BoardRole role) {
        return boardMemberRepository.save(
                BoardMember.builder().board(board).user(user).role(role).build());
    }

    @Test
    @DisplayName("역할 변경(dirty checking) 커밋 → 다음 체크가 새 역할을 본다")
    void roleChangeInvalidates() {
        String[] ids = tx.execute(s -> {
            User u = newUser();
            Board b = newBoard(u, null);
            newMember(b, u, BoardRole.MEMBER);
            return new String[] {b.getId(), u.getId()};
        });
        String boardId = ids[0];
        String userId = ids[1];

        assertThat(permissionService.isMemberOrAbove(boardId, userId)).isTrue();
        assertThat(cache.get(boardId, userId)).contains(BoardAccess.explicit(BoardRole.MEMBER));

        tx.executeWithoutResult(s -> boardMemberRepository
                .findByBoardIdAndUserId(boardId, userId)
                .orElseThrow()
                .updateRole(BoardRole.VIEWER));

        assertThat(cache.get(boardId, userId)).isEmpty();
        assertThat(permissionService.isMemberOrAbove(boardId, userId)).isFalse();
        assertThat(permissionService.isViewerOrAbove(boardId, userId)).isTrue();
    }

    @Test
    @DisplayName("멤버십 추가(persist) → 거부가 캐시돼 있어도 즉시 허용으로 바뀐다")
    void membershipAddInvalidatesNegativeEntry() {
        String[] ids = tx.execute(s -> {
            User owner = newUser();
            User other = newUser();
            Board b = newBoard(owner, null);
            newMember(b, owner, BoardRole.OWNER);
            return new String[] {b.getId(), other.getId()};
        });
        String boardId = ids[0];
        String otherId = ids[1];

        assertThat(permissionService.isViewerOrAbove(boardId, otherId)).isFalse();
        assertThat(cache.get(boardId, otherId)).contains(BoardAccess.none());

        tx.executeWithoutResult(s -> {
            Board b = boardRepository.findById(boardId).orElseThrow();
            User u = userRepository.findById(otherId).orElseThrow();
            newMember(b, u, BoardRole.VIEWER);
            // 같은 트랜잭션 안에서도 바로 반영된다 (Pre* 콜백 + 즉시 evict)
            assertThat(permissionService.isViewerOrAbove(boardId, otherId)).isTrue();
        });

        assertThat(permissionService.isViewerOrAbove(boardId, otherId)).isTrue();
        assertThat(permissionService.isMemberOrAbove(boardId, otherId)).isFalse();
    }

    @Test
    @DisplayName("멤버십 삭제(derived deleteBy) → 허용이 거부로 바뀐다")
    void membershipRemoveInvalidates() {
        String[] ids = tx.execute(s -> {
            User u = newUser();
            Board b = newBoard(u, null);
            newMember(b, u, BoardRole.ADMIN);
            return new String[] {b.getId(), u.getId()};
        });
        String boardId = ids[0];
        String userId = ids[1];

        assertThat(permissionService.isAdminOrAbove(boardId, userId)).isTrue();

        tx.executeWithoutResult(s -> boardMemberRepository.deleteByBoardIdAndUserId(boardId, userId));

        assertThat(permissionService.isAdminOrAbove(boardId, userId)).isFalse();
        assertThat(permissionService.isViewerOrAbove(boardId, userId)).isFalse();
    }

    @Test
    @DisplayName("systemRole 승격 → viewer 통과, member 는 여전히 거부 (우회 없음)")
    void systemRoleChangeInvalidates() {
        String[] ids = tx.execute(s -> {
            User owner = newUser();
            User other = newUser();
            Board b = newBoard(owner, null);
            newMember(b, owner, BoardRole.OWNER);
            return new String[] {b.getId(), other.getId()};
        });
        String boardId = ids[0];
        String otherId = ids[1];

        assertThat(permissionService.isViewerOrAbove(boardId, otherId)).isFalse();

        tx.executeWithoutResult(
                s -> userRepository.findById(otherId).orElseThrow().updateSystemRole(SystemRole.ADMIN));

        assertThat(permissionService.isViewerOrAbove(boardId, otherId)).isTrue();
        assertThat(permissionService.isMemberOrAbove(boardId, otherId)).isFalse();
    }

    @Test
    @DisplayName("조직 autoBoardAccess 토글 → 조직원의 가상 MEMBER 권한이 바뀐다")
    void orgAutoAccessToggleInvalidates() {
        String[] ids = tx.execute(s -> {
            User owner = newUser();
            User member = newUser();
            Organization org = organizationRepository.save(
                    Organization.builder().name("org").owner(owner).build());
            orgMemberRepository.save(OrganizationMember.builder()
                    .organization(org)
                    .user(member)
                    .role(OrgRole.MEMBER)
                    .build());
            Board b = newBoard(owner, org);
            newMember(b, owner, BoardRole.OWNER);
            return new String[] {b.getId(), member.getId(), org.getId()};
        });
        String boardId = ids[0];
        String memberId = ids[1];
        String orgId = ids[2];

        assertThat(permissionService.isViewerOrAbove(boardId, memberId)).isTrue();
        assertThat(permissionService.isMemberOrAbove(boardId, memberId)).isFalse();

        tx.executeWithoutResult(
                s -> organizationRepository.findById(orgId).orElseThrow().updateAutoBoardAccessEnabled(true));

        assertThat(permissionService.isMemberOrAbove(boardId, memberId)).isTrue();

        // 조직 탈퇴 → 폴백 소멸
        tx.executeWithoutResult(s -> orgMemberRepository
                .findByOrganizationIdAndUserId(orgId, memberId)
                .ifPresent(orgMemberRepository::delete));

        assertThat(permissionService.isViewerOrAbove(boardId, memberId)).isFalse();
    }
}
