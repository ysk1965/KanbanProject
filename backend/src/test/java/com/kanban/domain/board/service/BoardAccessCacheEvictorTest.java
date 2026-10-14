package com.kanban.domain.board.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.board.event.BoardAccessScopeChangedEvent;
import com.kanban.domain.board.event.BoardMembershipChangedEvent;
import com.kanban.domain.board.event.OrgMembershipChangedEvent;
import com.kanban.domain.board.event.OrgSettingsChangedEvent;
import com.kanban.domain.board.event.UserSystemRoleChangedEvent;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

/** simple(ConcurrentMap) 백엔드에서의 프리픽스/서픽스 무효화와 "즉시 + 커밋 뒤" 이중 실행. */
@DisplayName("BoardAccessCacheEvictor — simple 캐시")
class BoardAccessCacheEvictorTest {

    BoardAccessCache cache;
    BoardRepository boardRepository;
    BoardAccessCacheEvictor evictor;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        ObjectProvider<RedisConnectionFactory> noRedis = mock(ObjectProvider.class);
        cache = new BoardAccessCache(new ConcurrentMapCacheManager(), noRedis);
        boardRepository = mock(BoardRepository.class);
        evictor = new BoardAccessCacheEvictor(cache, boardRepository);

        put("b1", "u1");
        put("b1", "u2");
        put("b2", "u1");
        put("b2", "u3");
        put("b3", "u1");
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private void put(String board, String user) {
        cache.put(board, user, BoardAccess.explicit(BoardRole.MEMBER));
    }

    private boolean present(String board, String user) {
        return cache.get(board, user).isPresent();
    }

    @Test
    void evictSingleKey() {
        evictor.evict("b1", "u1");
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b1", "u2")).isTrue();
        assertThat(present("b2", "u1")).isTrue();
    }

    @Test
    @DisplayName("evictBoard — 그 보드의 모든 사용자 (프리픽스)")
    void evictBoard() {
        evictor.evictBoard("b1");
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b1", "u2")).isFalse();
        assertThat(present("b2", "u1")).isTrue();
        assertThat(present("b2", "u3")).isTrue();
        assertThat(present("b3", "u1")).isTrue();
    }

    @Test
    @DisplayName("evictUser — 그 사용자의 모든 보드 (서픽스)")
    void evictUser() {
        evictor.evictUser("u1");
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b2", "u1")).isFalse();
        assertThat(present("b3", "u1")).isFalse();
        assertThat(present("b1", "u2")).isTrue();
        assertThat(present("b2", "u3")).isTrue();
    }

    @Test
    @DisplayName("evictOrganization — 조직의 보드 목록을 조회해 그 보드들만")
    void evictOrganization() {
        when(boardRepository.findBoardIdsByOrgId("org")).thenReturn(List.of("b1", "b3"));
        evictor.evictOrganization("org");
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b1", "u2")).isFalse();
        assertThat(present("b3", "u1")).isFalse();
        assertThat(present("b2", "u1")).isTrue();
        assertThat(present("b2", "u3")).isTrue();
    }

    @Test
    void evictAll() {
        evictor.evictAll();
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b2", "u3")).isFalse();
    }

    @Test
    @DisplayName("트랜잭션 안에서는 즉시 비우고, 커밋 뒤 한 번 더 비운다")
    void evictsNowAndAgainAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();

        evictor.evict("b1", "u1");
        assertThat(present("b1", "u1")).isFalse();

        // 커밋 전 다른 요청이 옛 상태를 다시 캐시했다고 가정
        put("b1", "u1");
        assertThat(present("b1", "u1")).isTrue();

        TransactionSynchronizationUtils.triggerAfterCommit();
        assertThat(present("b1", "u1")).isFalse();
    }

    @Test
    @DisplayName("이벤트 → 대응하는 범위로 무효화")
    void eventsMapToScopes() {
        evictor.on(new BoardMembershipChangedEvent("b1", "u1"));
        assertThat(present("b1", "u1")).isFalse();
        assertThat(present("b1", "u2")).isTrue();

        evictor.on(new UserSystemRoleChangedEvent("u3"));
        assertThat(present("b2", "u3")).isFalse();
        assertThat(present("b2", "u1")).isTrue();

        evictor.on(new OrgMembershipChangedEvent("org", "u2"));
        assertThat(present("b1", "u2")).isFalse();

        evictor.on(new BoardAccessScopeChangedEvent("b3"));
        assertThat(present("b3", "u1")).isFalse();
        assertThat(present("b2", "u1")).isTrue();

        evictor.on(new OrgSettingsChangedEvent("org"));
        assertThat(present("b2", "u1")).isFalse();
    }
}
