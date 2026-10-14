package com.kanban.domain.board.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Predicate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;
import org.springframework.data.redis.cache.RedisCache;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.stereotype.Component;

/**
 * {@code boardAccess} 캐시 저장소 — 키 형식과 백엔드(Redis / simple ConcurrentMap) 차이를 여기서 흡수한다.
 *
 * <p>키: {@code <boardId>:<userId>} (Redis 에서는 {@code boardAccess::<boardId>:<userId>}). 두 ID 모두 UUID 라
 * 구분자 {@code :} 와 충돌하지 않는다.
 *
 * <p>{@code TransactionAwareCacheDecorator} 를 벗겨 대상 캐시에 직접 쓴다. 두 가지 이유:
 * <ol>
 *   <li>put 이 트랜잭션 커밋 뒤로 미뤄지면 같은 요청 안의 반복 권한 체크가 매번 미스가 된다(353개 호출 지점의
 *       이득이 사라진다). 리졸버는 읽기만 하므로 즉시 put 해도 미커밋 데이터가 캐시에 들어갈 일은 없다.</li>
 *   <li>evict 를 after-commit 콜백 안에서 호출할 때 데코레이터가 또 synchronization 을 등록하면 이미 지나간
 *       단계라 조용히 유실된다.</li>
 * </ol>
 */
@Slf4j
@Component
public class BoardAccessCache {

    public static final String CACHE_NAME = "boardAccess";
    private static final int SCAN_BATCH = 1000;

    private final CacheManager cacheManager;
    private final ObjectProvider<RedisConnectionFactory> redisConnectionFactory;

    public BoardAccessCache(CacheManager cacheManager, ObjectProvider<RedisConnectionFactory> redisConnectionFactory) {
        this.cacheManager = cacheManager;
        this.redisConnectionFactory = redisConnectionFactory;
    }

    public static String key(String boardId, String userId) {
        return boardId + ":" + userId;
    }

    public Optional<BoardAccess> get(String boardId, String userId) {
        Cache cache = cache();
        if (cache == null) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(cache.get(key(boardId, userId), BoardAccess.class));
        } catch (RuntimeException e) {
            // 역직렬화 실패·연결 오류는 미스로 취급한다 — 권한 체크가 캐시 장애로 막히면 안 된다
            log.warn("boardAccess cache read failed for {}:{} — treating as miss: {}", boardId, userId, e.getMessage());
            return Optional.empty();
        }
    }

    public void put(String boardId, String userId, BoardAccess access) {
        Cache cache = cache();
        if (cache == null) {
            return;
        }
        try {
            cache.put(key(boardId, userId), access);
        } catch (RuntimeException e) {
            log.warn("boardAccess cache write failed for {}:{}: {}", boardId, userId, e.getMessage());
        }
    }

    public void evict(String boardId, String userId) {
        Cache cache = cache();
        if (cache != null) {
            cache.evict(key(boardId, userId));
        }
    }

    /** 특정 보드의 모든 사용자 엔트리. */
    public void evictBoard(String boardId) {
        evictMatching(glob(boardId) + ":*", k -> k.startsWith(boardId + ":"));
    }

    /** 특정 사용자의 모든 보드 엔트리. */
    public void evictUser(String userId) {
        evictMatching("*:" + glob(userId), k -> k.endsWith(":" + userId));
    }

    /** 여러 보드의 엔트리를 한 번의 스캔으로. */
    public void evictBoards(Collection<String> boardIds) {
        if (boardIds.isEmpty()) {
            return;
        }
        Set<String> ids = Set.copyOf(boardIds);
        evictMatching("*", k -> {
            int sep = k.indexOf(':');
            return sep > 0 && ids.contains(k.substring(0, sep));
        });
    }

    public void clear() {
        Cache cache = cache();
        if (cache != null) {
            cache.clear();
        }
    }

    /**
     * 키 패턴 일치 삭제. {@code pattern} 은 Redis MATCH 용 glob(프리픽스 제외), {@code matcher} 는 simple 캐시용
     * 자바 술어 — 둘은 같은 집합을 가리켜야 한다.
     */
    void evictMatching(String pattern, Predicate<String> matcher) {
        Cache cache = cache();
        if (cache == null) {
            return;
        }
        if (cache instanceof RedisCache redisCache) {
            RedisConnectionFactory factory = redisConnectionFactory.getIfAvailable();
            if (factory == null) {
                log.warn("boardAccess: RedisCache without RedisConnectionFactory — clearing whole cache");
                cache.clear();
                return;
            }
            String prefix = redisCache.getCacheConfiguration().getKeyPrefixFor(CACHE_NAME);
            evictRedis(factory, prefix + pattern);
            return;
        }
        Object nativeCache = cache.getNativeCache();
        if (nativeCache instanceof ConcurrentMap<?, ?> map) {
            map.keySet().removeIf(k -> matcher.test(String.valueOf(k)));
            return;
        }
        log.warn(
                "boardAccess: unsupported cache backend {} — clearing whole cache",
                nativeCache.getClass().getSimpleName());
        cache.clear();
    }

    private void evictRedis(RedisConnectionFactory factory, String fullPattern) {
        byte[] patternBytes = fullPattern.getBytes(StandardCharsets.UTF_8);
        try (RedisConnection connection = factory.getConnection()) {
            List<byte[]> batch = new ArrayList<>(SCAN_BATCH);
            ScanOptions options = ScanOptions.scanOptions()
                    .match(patternBytes)
                    .count(SCAN_BATCH)
                    .build();
            try (Cursor<byte[]> cursor = connection.keyCommands().scan(options)) {
                while (cursor.hasNext()) {
                    batch.add(cursor.next());
                    if (batch.size() >= SCAN_BATCH) {
                        connection.keyCommands().del(batch.toArray(new byte[0][]));
                        batch.clear();
                    }
                }
            }
            if (!batch.isEmpty()) {
                connection.keyCommands().del(batch.toArray(new byte[0][]));
            }
        } catch (RuntimeException e) {
            log.warn("boardAccess: Redis eviction failed for pattern {}: {}", fullPattern, e.getMessage());
        }
    }

    /** 데코레이터를 벗긴 대상 캐시. 캐시 매니저가 없거나 캐시를 못 만들면 null. */
    Cache cache() {
        Cache cache = cacheManager.getCache(CACHE_NAME);
        if (cache instanceof TransactionAwareCacheDecorator decorator) {
            return decorator.getTargetCache();
        }
        return cache;
    }

    /** Redis MATCH 글롭 메타문자 이스케이프 (ID 는 UUID 라 사실상 no-op 이지만 안전하게). */
    private static String glob(String raw) {
        StringBuilder sb = new StringBuilder(raw.length());
        for (char c : raw.toCharArray()) {
            if (c == '*' || c == '?' || c == '[' || c == ']' || c == '\\') {
                sb.append('\\');
            }
            sb.append(c);
        }
        return sb.toString();
    }
}
