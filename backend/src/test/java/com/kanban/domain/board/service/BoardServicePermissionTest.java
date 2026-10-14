package com.kanban.domain.board.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 보드 권한 체크 매트릭스 — BoardService 의 {@code @Deprecated} 위임 메서드가 BoardPermissionService(캐시)를 통해
 * 종전과 같은 결과를 내는지 고정한다. 순수 매트릭스는 {@link BoardPermissionServiceTest} 가 더 넓게 다룬다.
 *
 * <p>BoardService 는 생성자 인자가 40개가 넘어 Mockito 생성자 주입이 모르는 타입은 null 로 채운다. 권한 서비스는
 * 실제 객체(mock 저장소 + ConcurrentMap 캐시)로 만들어 리플렉션으로 꽂는다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("BoardService 권한 체크 (BoardPermissionService 위임)")
class BoardServicePermissionTest {

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

    @InjectMocks
    BoardService boardService;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void wirePermissionService() {
        ObjectProvider<RedisConnectionFactory> noRedis = mock(ObjectProvider.class);
        BoardAccessCache cache = new BoardAccessCache(new ConcurrentMapCacheManager(), noRedis);
        BoardAccessResolver resolver = new BoardAccessResolver(
                cache, boardMemberRepository, userRepository, boardRepository, orgMemberRepository);
        ReflectionTestUtils.setField(
                boardService,
                "boardPermissionService",
                new BoardPermissionService(resolver, boardRepository, boardMemberRepository));
    }

    private void membership(BoardRole role) {
        BoardMember member = BoardMember.builder().role(role).build();
        when(boardMemberRepository.findByBoardIdAndUserId(BOARD, USER)).thenReturn(Optional.of(member));
    }

    private void noMembership() {
        when(boardMemberRepository.findByBoardIdAndUserId(BOARD, USER)).thenReturn(Optional.empty());
    }

    private static void assertDenied(ThrowingRunnable r) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.BOARD_ACCESS_DENIED);
    }

    @FunctionalInterface
    interface ThrowingRunnable {
        void run();
    }

    @Nested
    @DisplayName("checkOwner")
    class CheckOwner {

        @Test
        void ownerAllowed() {
            membership(BoardRole.OWNER);
            assertThatCode(() -> boardService.checkOwner(BOARD, USER)).doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "{0} 는 거부")
        @EnumSource(
                value = BoardRole.class,
                names = {"ADMIN", "MEMBER", "VIEWER"})
        void nonOwnerDenied(BoardRole role) {
            membership(role);
            assertDenied(() -> boardService.checkOwner(BOARD, USER));
        }

        @Test
        void nonMemberDenied() {
            noMembership();
            assertDenied(() -> boardService.checkOwner(BOARD, USER));
        }
    }

    @Nested
    @DisplayName("checkAdminOrAbove")
    class CheckAdminOrAbove {

        @ParameterizedTest(name = "{0} 허용")
        @EnumSource(
                value = BoardRole.class,
                names = {"OWNER", "ADMIN"})
        void adminOrOwnerAllowed(BoardRole role) {
            membership(role);
            assertThatCode(() -> boardService.checkAdminOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @ParameterizedTest(name = "{0} 거부")
        @EnumSource(
                value = BoardRole.class,
                names = {"MEMBER", "VIEWER"})
        void memberOrViewerDenied(BoardRole role) {
            membership(role);
            assertDenied(() -> boardService.checkAdminOrAbove(BOARD, USER));
        }

        @Test
        void nonMemberDenied() {
            noMembership();
            assertDenied(() -> boardService.checkAdminOrAbove(BOARD, USER));
        }
    }

    @Nested
    @DisplayName("checkMemberOrAbove")
    class CheckMemberOrAbove {

        @ParameterizedTest(name = "{0} 허용")
        @EnumSource(
                value = BoardRole.class,
                names = {"OWNER", "ADMIN", "MEMBER"})
        void memberOrAboveAllowed(BoardRole role) {
            membership(role);
            assertThatCode(() -> boardService.checkMemberOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @Test
        void viewerDenied() {
            membership(BoardRole.VIEWER);
            assertDenied(() -> boardService.checkMemberOrAbove(BOARD, USER));
            // 명시적 멤버십이 있으면 조직 폴백을 보지 않는다
            verify(boardRepository, never()).findById(any());
        }

        @Test
        @DisplayName("비멤버 + 개인/일반 보드 → 거부")
        void nonMemberOnPlainBoardDenied() {
            noMembership();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder().id(BOARD).build()));
            assertDenied(() -> boardService.checkMemberOrAbove(BOARD, USER));
        }

        @Test
        @DisplayName("비멤버 + 조직 보드 + auto access ON + 조직원 → 가상 MEMBER 로 허용")
        void orgMemberWithAutoAccessAllowed() {
            noMembership();
            Organization org =
                    Organization.builder().id(ORG).autoBoardAccessEnabled(true).build();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(
                            Board.builder().id(BOARD).organization(org).build()));
            when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(true);

            assertThatCode(() -> boardService.checkMemberOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("비멤버 + 조직 보드 + auto access OFF → 조직원이어도 거부")
        void orgMemberWithoutAutoAccessDenied() {
            noMembership();
            Organization org =
                    Organization.builder().id(ORG).autoBoardAccessEnabled(false).build();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(
                            Board.builder().id(BOARD).organization(org).build()));

            assertDenied(() -> boardService.checkMemberOrAbove(BOARD, USER));
        }

        @Test
        @DisplayName("비멤버 + 조직 보드 + auto access ON + 조직원 아님 → 거부")
        void outsiderOnAutoAccessBoardDenied() {
            noMembership();
            Organization org =
                    Organization.builder().id(ORG).autoBoardAccessEnabled(true).build();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(
                            Board.builder().id(BOARD).organization(org).build()));
            when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(false);

            assertDenied(() -> boardService.checkMemberOrAbove(BOARD, USER));
        }
    }

    @Nested
    @DisplayName("checkViewerOrAbove")
    class CheckViewerOrAbove {

        @Test
        @DisplayName("멤버십이 있으면 역할과 무관하게 허용 (VIEWER 포함)")
        void anyMemberAllowed() {
            membership(BoardRole.VIEWER);
            assertThatCode(() -> boardService.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
            verify(userRepository, never()).findById(any());
        }

        @Test
        @DisplayName("시스템 ADMIN 은 멤버십 없이도 열람 가능")
        void systemAdminAllowed() {
            noMembership();
            when(userRepository.findById(USER))
                    .thenReturn(Optional.of(User.builder()
                            .id(USER)
                            .email("admin@x")
                            .name("Admin")
                            .systemRole(SystemRole.ADMIN)
                            .build()));

            assertThatCode(() -> boardService.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("조직 보드는 조직원이면 열람 가능 (auto access 설정과 무관)")
        void orgMemberCanViewOrgBoard() {
            noMembership();
            when(userRepository.findById(USER))
                    .thenReturn(Optional.of(User.builder()
                            .id(USER)
                            .email("u@x")
                            .name("U")
                            .systemRole(SystemRole.USER)
                            .build()));
            Organization org =
                    Organization.builder().id(ORG).autoBoardAccessEnabled(false).build();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(
                            Board.builder().id(BOARD).organization(org).build()));
            when(orgMemberRepository.existsByOrganizationIdAndUserId(ORG, USER)).thenReturn(true);

            assertThatCode(() -> boardService.checkViewerOrAbove(BOARD, USER)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("비멤버 + 일반 사용자 + 일반 보드 → 거부")
        void outsiderDenied() {
            noMembership();
            when(userRepository.findById(USER))
                    .thenReturn(Optional.of(
                            User.builder().id(USER).email("u@x").name("U").build()));
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder().id(BOARD).build()));

            assertDenied(() -> boardService.checkViewerOrAbove(BOARD, USER));
        }

        @Test
        @DisplayName("사용자/보드 레코드가 없어도 NPE 없이 거부")
        void missingUserAndBoardDenied() {
            noMembership();
            when(userRepository.findById(USER)).thenReturn(Optional.empty());
            when(boardRepository.findById(BOARD)).thenReturn(Optional.empty());

            assertDenied(() -> boardService.checkViewerOrAbove(BOARD, USER));
        }
    }

    @Test
    @DisplayName("getMembershipOrThrow — 멤버십이 없으면 BOARD_ACCESS_DENIED")
    void membershipOrThrow() {
        noMembership();
        assertDenied(() -> boardService.getMembershipOrThrow(BOARD, USER));
    }
}
