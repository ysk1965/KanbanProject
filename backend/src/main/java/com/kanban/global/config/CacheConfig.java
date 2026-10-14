package com.kanban.global.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.BatchStrategies;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 캐시 설정
 * - Board, Block 등 자주 조회되는 데이터 캐싱
 * - 캐시 만료 시간 설정
 */
@Slf4j
@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * 캐시 값 직렬화용 ObjectMapper. NON_FINAL 기본 타이핑이라 record 처럼 final 인 값 타입은 스스로
     * {@code @JsonTypeInfo} 를 달아야 역직렬화된다 (예: {@code BoardAccess}). 테스트에서 라운드트립 검증에 쓰도록 공개.
     */
    public static ObjectMapper cacheObjectMapper() {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        PolymorphicTypeValidator typeValidator = BasicPolymorphicTypeValidator.builder()
                .allowIfBaseType("com.kanban.")
                .allowIfBaseType("java.util.")
                .allowIfBaseType("java.time.")
                .build();
        objectMapper.activateDefaultTyping(
                typeValidator, ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        return objectMapper;
    }

    /**
     * Redis 캐시 매니저 설정
     * - spring.cache.type=redis 일 때만 활성화
     */
    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
        log.info("Initializing Redis Cache Manager");

        GenericJackson2JsonRedisSerializer serializer = new GenericJackson2JsonRedisSerializer(cacheObjectMapper());

        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer))
                .entryTtl(Duration.ofMinutes(10)) // 기본 10분
                .disableCachingNullValues();

        // 캐시별 TTL 설정
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();

        // Board 캐시: 5분 (자주 변경될 수 있음)
        cacheConfigurations.put("boards", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        // Block 캐시: 30분 (거의 변경되지 않음)
        cacheConfigurations.put("blocks", defaultConfig.entryTtl(Duration.ofMinutes(30)));

        // Member 캐시: 10분
        cacheConfigurations.put("members", defaultConfig.entryTtl(Duration.ofMinutes(10)));

        // Feature 캐시: 5분
        cacheConfigurations.put("features", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        // Shared Gallery 캐시: 5분 (공유 링크 200명 동접 대응)
        cacheConfigurations.put("sharedGallery", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        // Shared Photos 캐시: 3분 (커서 기반 페이지별 캐싱)
        cacheConfigurations.put("sharedPhotos", defaultConfig.entryTtl(Duration.ofMinutes(3)));

        // System Config 캐시: 5분 (MONETIZATION_ENABLED 등 전역 설정 — 변경 시 @CacheEvict로 즉시 무효화)
        cacheConfigurations.put("systemConfig", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        // 보드 접근 권한(BoardAccess): 2분 — 정확성은 엔티티 리스너 기반 즉시 무효화가 담당하고 TTL 은 안전망이다
        cacheConfigurations.put("boardAccess", defaultConfig.entryTtl(Duration.ofMinutes(2)));

        // 백로그 승격 AI 추천: 24시간 (같은 항목을 다시 열어도 크레딧이 또 빠지지 않게 한다)
        cacheConfigurations.put("promoteSuggestions", defaultConfig.entryTtl(Duration.ofHours(24)));

        // allEntries=true 비우기가 기본 KEYS 패턴 스캔이라 Redis 를 블로킹했다 → SCAN(1000) 으로 교체.
        RedisCacheWriter cacheWriter =
                RedisCacheWriter.nonLockingRedisCacheWriter(connectionFactory, BatchStrategies.scan(1000));

        return RedisCacheManager.builder(cacheWriter)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigurations)
                .transactionAware()
                .build();
    }
}
