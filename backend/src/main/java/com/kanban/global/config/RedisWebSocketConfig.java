package com.kanban.global.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * Redis Pub/Sub configuration for WebSocket message relay.
 * Only activated when app.websocket.broker-type=redis (prod profile).
 * In local/dev, this entire configuration is skipped.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "app.websocket.broker-type", havingValue = "redis")
public class RedisWebSocketConfig {

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory connectionFactory) {
        log.info("Initializing Redis WebSocket Pub/Sub listener container");
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        return container;
    }

    @Bean("wsRedisTemplate")
    public StringRedisTemplate wsRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
