package com.kanban.domain.board.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.board.BoardType;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

/**
 * BoardPermissionService 권한 매트릭스 + 캐시 동작. 저장소는 전부 mock, 캐시는 실제 ConcurrentMapCacheManager.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("BoardPermissionService — 권한 매트릭스와 캐시")
class BoardPermissionServiceTest {

    private static final String BOARD = "board-1";
    private static final String USER = "user-1";
    private static final String ORG = "org-1";

    @Mock
    BoardRepository boardRepository;

    @Mock
    BoardMemberRepository boardMemberRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    OrgMemberRepository orgMemberRepository;

    BoardAccessCache cache;
    BoardPermissionService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        ObjectProvider<RedisConnectionFactory> noRedis = mock(ObjectProvider.class);
        cache = new BoardAccessCache(new ConcurrentMapCacheManager(), noRedis);
        BoardAccessResolver resolver = new BoardAccessResolver(
                cache, boardMemberRepository, userRepository, boardRepository, orgMemberRepository);
        service = new BoardPermissionService(resolver, boardRepository, boardMemberRepository);
    }

    private void membership(BoardRole role) {
        BoardMember member = BoardMember.builder().role(role).build();
        when(boardMemberRepository.findByBoardIdAndUserId(BOARD, USER)).thenReturn(Optional.of(member));
    }

    private void noMembership() {
        when(boardMemberRepository.findByBoardIdAndUserId(BOARD, USER)).thenReturn(Optional.empty());
    }

    private void user(SystemRole role) {
        when(userRepository.findById(USER))
                .thenReturn(Optional.of(User.builder()
                        .id(USER)
                        .email("u@x")
                        .name("U")
                        .systemRole(role)
                        .build()));
    }

    private void plainBoard() {
        when(boardRepository.findById(BOARD))
                .thenReturn(Optional.of(Board.builder().id(BOARD).build()));
    }

    private void orgBoard(boolean autoAccess, boolean orgMember) {
        Organization org = Organization.builder()
                .id(ORG)
                .autoBoardAccessEnabled(autoAccess)
                .build();
        when(boardRepository.findById(BOARD))
                .thenReturn(
                        Optional.of(Board.builder().id(BOARD).organization(org).build()));
        when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(orgMember);
    }

    private static void assertDenied(Runnable r) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.BOARD_ACCESS_DENIED);
    }

    @Nested
    @DisplayName("명시적 멤버십")
    class ExplicitMembership {

        @ParameterizedTest(name = "{0} → viewerOrAbove 허용")
        @EnumSource(BoardRole.class)
        void anyRoleIsViewer(BoardRole role) {
            membership(role);
            assertThatCode(() -> service.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertThat(service.explicitRole(BOARD, USER)).contains(role);
            // 명시적 멤버십이 있으면 사용자/보드/조직 조회를 하지 않는다
            verify(userRepository, never()).findById(any());
            verify(boardRepository, never()).findById(any());
            verify(orgMemberRepository, never()).existsByOrganizationIdAndUserId(any(), any());
        }

        @ParameterizedTest(name = "{0} → memberOrAbove 허용")
        @EnumSource(
                value = BoardRole.class,
                names = {"OWNER", "ADMIN", "MEMBER"})
        void memberOrAboveAllowed(BoardRole role) {
            membership(role);
            assertThatCode(() -> service.checkMemberOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertThat(service.isMemberOrAbove(BOARD, USER)).isTrue();
        }

        @Test
        @DisplayName("VIEWER 는 memberOrAbove 거부 — 조직 폴백도 보지 않는다")
        void viewerDeniedForMember() {
            membership(BoardRole.VIEWER);
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
            assertThat(service.isMemberOrAbove(BOARD, USER)).isFalse();
            verify(boardRepository, never()).findById(any());
        }

        @ParameterizedTest(name = "{0} → adminOrAbove 허용")
        @EnumSource(
                value = BoardRole.class,
                names = {"OWNER", "ADMIN"})
        void adminOrAboveAllowed(BoardRole role) {
            membership(role);
            assertThatCode(() -> service.checkAdminOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "{0} → adminOrAbove 거부")
        @EnumSource(
                value = BoardRole.class,
                names = {"MEMBER", "VIEWER"})
        void adminOrAboveDenied(BoardRole role) {
            membership(role);
            assertDenied(() -> service.checkAdminOrAbove(BOARD, USER));
            assertThat(service.isAdminOrAbove(BOARD, USER)).isFalse();
        }

        @Test
        void ownerAllowed() {
            membership(BoardRole.OWNER);
            assertThatCode(() -> service.checkOwner(BOARD, USER)).doesNotThrowAnyException();
            assertThat(service.isOwner(BOARD, USER)).isTrue();
        }

        @ParameterizedTest(name = "{0} → owner 거부")
        @EnumSource(
                value = BoardRole.class,
                names = {"ADMIN", "MEMBER", "VIEWER"})
        void nonOwnerDenied(BoardRole role) {
            membership(role);
            assertDenied(() -> service.checkOwner(BOARD, USER));
        }
    }

    @Nested
    @DisplayName("멤버십 없음 — 시스템 ADMIN / 조직 폴백")
    class NoMembership {

        @Test
        @DisplayName("시스템 ADMIN 은 viewer 만 통과, member/admin/owner 는 거부 (우회 없음)")
        void systemAdminViewerOnly() {
            noMembership();
            user(SystemRole.ADMIN);
            plainBoard();

            assertThatCode(() -> service.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
            assertDenied(() -> service.checkAdminOrAbove(BOARD, USER));
            assertDenied(() -> service.checkOwner(BOARD, USER));
            assertThat(service.explicitRole(BOARD, USER)).isEmpty();
        }

        @Test
        @DisplayName("조직 보드 + 조직원 + auto access OFF → viewer 만")
        void orgMemberWithoutAutoAccess() {
            noMembership();
            user(SystemRole.USER);
            orgBoard(false, true);

            assertThatCode(() -> service.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
        }

        @Test
        @DisplayName("조직 보드 + 조직원 + auto access ON → 가상 MEMBER (admin/owner 는 거부)")
        void orgMemberWithAutoAccess() {
            noMembership();
            user(SystemRole.USER);
            orgBoard(true, true);

            assertThatCode(() -> service.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertThatCode(() -> service.checkMemberOrAbove(BOARD, USER)).doesNotThrowAnyException();
            assertDenied(() -> service.checkAdminOrAbove(BOARD, USER));
            assertDenied(() -> service.checkOwner(BOARD, USER));
        }

        @Test
        @DisplayName("조직 보드 + auto access ON + 조직원 아님 → 전부 거부")
        void outsiderOnAutoAccessBoard() {
            noMembership();
            user(SystemRole.USER);
            orgBoard(true, false);

            assertDenied(() -> service.checkViewerOrAbove(BOARD, USER));
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
        }

        @Test
        @DisplayName("일반 보드 + 일반 사용자 → 전부 거부")
        void outsiderOnPlainBoard() {
            noMembership();
            user(SystemRole.USER);
            plainBoard();

            assertDenied(() -> service.checkViewerOrAbove(BOARD, USER));
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
            verify(orgMemberRepository, never()).existsByOrganizationIdAndUserId(any(), any());
        }

        @Test
        @DisplayName("보드·사용자 레코드가 없어도 NPE 없이 거부")
        void missingBoardAndUser() {
            noMembership();
            when(userRepository.findById(USER)).thenReturn(Optional.empty());
            when(boardRepository.findById(BOARD)).thenReturn(Optional.empty());

            assertDenied(() -> service.checkViewerOrAbove(BOARD, USER));
            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
            assertDenied(() -> service.checkAdminOrAbove(BOARD, USER));
            assertDenied(() -> service.checkOwner(BOARD, USER));
            assertThat(service.access(BOARD, USER)).isEqualTo(BoardAccess.none());
        }
    }

    @Nested
    @DisplayName("캐시")
    class Caching {

        @Test
        @DisplayName("두 번째 호출부터는 저장소를 안 본다")
        void secondCallHitsCache() {
            membership(BoardRole.MEMBER);

            service.checkViewerOrAbove(BOARD, USER);
            service.checkMemberOrAbove(BOARD, USER);
            service.checkViewerOrAbove(BOARD, USER);
            assertThat(service.isAdminOrAbove(BOARD, USER)).isFalse();

            verify(boardMemberRepository, times(1)).findByBoardIdAndUserId(BOARD, USER);
            assertThat(cache.get(BOARD, USER)).contains(BoardAccess.explicit(BoardRole.MEMBER));
        }

        @Test
        @DisplayName("멤버십 없음(none)도 캐시된다 — 거부 경로가 매번 4쿼리를 내지 않도록")
        void negativeResultIsCached() {
            noMembership();
            when(userRepository.findById(USER)).thenReturn(Optional.empty());
            when(boardRepository.findById(BOARD)).thenReturn(Optional.empty());

            assertThat(service.isViewerOrAbove(BOARD, USER)).isFalse();
            assertThat(service.isViewerOrAbove(BOARD, USER)).isFalse();

            verify(boardMemberRepository, times(1)).findByBoardIdAndUserId(BOARD, USER);
            verify(userRepository, times(1)).findById(USER);
        }

        @Test
        @DisplayName("evict 후에는 다시 조회한다")
        void evictForcesReload() {
            membership(BoardRole.MEMBER);
            service.checkMemberOrAbove(BOARD, USER);

            cache.evict(BOARD, USER);
            BoardMember viewer = BoardMember.builder().role(BoardRole.VIEWER).build();
            when(boardMemberRepository.findByBoardIdAndUserId(BOARD, USER)).thenReturn(Optional.of(viewer));

            assertDenied(() -> service.checkMemberOrAbove(BOARD, USER));
            verify(boardMemberRepository, times(2)).findByBoardIdAndUserId(BOARD, USER);
        }
    }

    @Nested
    @DisplayName("기타")
    class Others {

        @Test
        @DisplayName("membershipOrThrow — 없으면 BOARD_ACCESS_DENIED, 캐시와 무관하게 행을 읽는다")
        void membershipOrThrow() {
            noMembership();
            assertDenied(() -> service.membershipOrThrow(BOARD, USER));
        }

        @Test
        @DisplayName("checkTeamBoardOnly — 개인 보드는 PERSONAL_BOARD_NO_INVITE, 없는 보드는 통과")
        void teamBoardOnly() {
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder()
                            .id(BOARD)
                            .boardType(BoardType.PERSONAL)
                            .build()));
            assertThatThrownBy(() -> service.checkTeamBoardOnly(BOARD))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.PERSONAL_BOARD_NO_INVITE);

            when(boardRepository.findById("missing")).thenReturn(Optional.empty());
            assertThatCode(() -> service.checkTeamBoardOnly("missing")).doesNotThrowAnyException();
        }
    }
}
