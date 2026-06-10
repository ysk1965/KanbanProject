package com.kanban.global.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

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
     * Redis 캐시 매니저 설정
     * - spring.cache.type=redis 일 때만 활성화
     */
    @Bean
    @ConditionalOnProperty(name = "spring.cache.type", havingValue = "redis")
    public CacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
        log.info("Initializing Redis Cache Manager");

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        PolymorphicTypeValidator typeValidator = BasicPolymorphicTypeValidator.builder()
                .allowIfBaseType("com.kanban.")
                .allowIfBaseType("java.util.")
                .allowIfBaseType("java.time.")
                .build();
        objectMapper.activateDefaultTyping(
                typeValidator,
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.PROPERTY
        );

        GenericJackson2JsonRedisSerializer serializer =
                new GenericJackson2JsonRedisSerializer(objectMapper);

        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer))
                .entryTtl(Duration.ofMinutes(10))  // 기본 10분
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

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigurations)
                .transactionAware()
                .build();
    }
}
