package com.kanban.domain.board.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.domain.board.BoardRole;
import com.kanban.global.config.CacheConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;

/**
 * Redis 캐시 직렬화 라운드트립. CacheConfig 의 ObjectMapper 는 NON_FINAL 기본 타이핑이라 record(final) 는
 * {@code @JsonTypeInfo} 가 없으면 LinkedHashMap 으로 돌아온다 — 그 회귀를 여기서 잡는다.
 */
@DisplayName("BoardAccess — Redis 캐시 직렬화 라운드트립")
class BoardAccessSerializationTest {

    private final GenericJackson2JsonRedisSerializer serializer =
            new GenericJackson2JsonRedisSerializer(CacheConfig.cacheObjectMapper());

    @Test
    void explicitRoleRoundTrip() {
        BoardAccess original = BoardAccess.explicit(BoardRole.ADMIN);
        byte[] bytes = serializer.serialize(original);
        assertThat(new String(bytes)).contains("@class").contains("BoardAccess");

        Object restored = serializer.deserialize(bytes);
        assertThat(restored).isInstanceOf(BoardAccess.class).isEqualTo(original);
        assertThat(((BoardAccess) restored).isAdminOrAbove()).isTrue();
    }

    @Test
    void orgFallbackRoundTrip() {
        BoardAccess original = new BoardAccess(null, true, true, true, false);
        Object restored = serializer.deserialize(serializer.serialize(original));
        assertThat(restored).isEqualTo(original);
        assertThat(((BoardAccess) restored).isViewerOrAbove()).isTrue();
        assertThat(((BoardAccess) restored).isMemberOrAbove()).isFalse();
    }

    @Test
    void noneRoundTrip() {
        Object restored = serializer.deserialize(serializer.serialize(BoardAccess.none()));
        assertThat(restored).isEqualTo(BoardAccess.none());
    }
}
