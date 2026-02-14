package com.kanban.global.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.websocket.dto.RedisWsMessage;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Redis Pub/Sub bridge for WebSocket message relay across multiple instances.
 * Uses per-board channels (ws:board:{boardId}) for scalability.
 * Only active when app.websocket.broker-type=redis (prod).
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "app.websocket.broker-type", havingValue = "redis")
public class RedisWebSocketBridge {

    private final SimpMessagingTemplate messagingTemplate;
    private final org.springframework.data.redis.core.StringRedisTemplate redisTemplate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ObjectMapper objectMapper;
    private final InstanceIdHolder instanceIdHolder;

    // Per-board subscription reference counting
    private final ConcurrentHashMap<String, AtomicInteger> boardSubscriptions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, MessageListener> activeBoardListeners = new ConcurrentHashMap<>();

    // Per-user subscription reference counting
    private final ConcurrentHashMap<String, AtomicInteger> userSubscriptions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, MessageListener> activeUserListeners = new ConcurrentHashMap<>();

    public RedisWebSocketBridge(
            SimpMessagingTemplate messagingTemplate,
            org.springframework.data.redis.core.StringRedisTemplate wsRedisTemplate,
            RedisMessageListenerContainer listenerContainer,
            ObjectMapper objectMapper,
            InstanceIdHolder instanceIdHolder
    ) {
        this.messagingTemplate = messagingTemplate;
        this.redisTemplate = wsRedisTemplate;
        this.listenerContainer = listenerContainer;
        this.objectMapper = objectMapper;
        this.instanceIdHolder = instanceIdHolder;
        log.info("RedisWebSocketBridge initialized, instanceId={}", instanceIdHolder.getInstanceId());
    }

    /**
     * Publish a board event to Redis channel ws:board:{boardId}.
     */
    public void publishBoardEvent(String boardId, String destination, Object payload) {
        publish("ws:board:" + boardId, destination, payload);
    }

    /**
     * Publish a user-specific event to Redis channel ws:user:{userId}.
     */
    public void publishUserEvent(String userId, String destination, Object payload) {
        publish("ws:user:" + userId, destination, payload);
    }

    /**
     * Subscribe to a board's Redis channel when a local client connects.
     * Uses reference counting to manage channel lifecycle.
     */
    public void subscribeBoardChannel(String boardId) {
        String channel = "ws:board:" + boardId;
        boardSubscriptions.computeIfAbsent(boardId, k -> new AtomicInteger(0));
        if (boardSubscriptions.get(boardId).incrementAndGet() == 1) {
            MessageListener listener = createMessageListener();
            listenerContainer.addMessageListener(listener, new ChannelTopic(channel));
            activeBoardListeners.put(boardId, listener);
            log.debug("Redis subscribed to channel: {}", channel);
        }
    }

    /**
     * Unsubscribe from a board's Redis channel when the last local client disconnects.
     */
    public void unsubscribeBoardChannel(String boardId) {
        String channel = "ws:board:" + boardId;
        AtomicInteger count = boardSubscriptions.get(boardId);
        if (count != null && count.decrementAndGet() <= 0) {
            MessageListener listener = activeBoardListeners.remove(boardId);
            if (listener != null) {
                listenerContainer.removeMessageListener(listener, new ChannelTopic(channel));
            }
            boardSubscriptions.remove(boardId);
            log.debug("Redis unsubscribed from channel: {}", channel);
        }
    }

    /**
     * Subscribe to a user's Redis channel for user-specific events.
     */
    public void subscribeUserChannel(String userId) {
        String channel = "ws:user:" + userId;
        userSubscriptions.computeIfAbsent(userId, k -> new AtomicInteger(0));
        if (userSubscriptions.get(userId).incrementAndGet() == 1) {
            MessageListener listener = createMessageListener();
            listenerContainer.addMessageListener(listener, new ChannelTopic(channel));
            activeUserListeners.put(userId, listener);
            log.debug("Redis subscribed to user channel: {}", channel);
        }
    }

    /**
     * Unsubscribe from a user's Redis channel.
     */
    public void unsubscribeUserChannel(String userId) {
        String channel = "ws:user:" + userId;
        AtomicInteger count = userSubscriptions.get(userId);
        if (count != null && count.decrementAndGet() <= 0) {
            MessageListener listener = activeUserListeners.remove(userId);
            if (listener != null) {
                listenerContainer.removeMessageListener(listener, new ChannelTopic(channel));
            }
            userSubscriptions.remove(userId);
            log.debug("Redis unsubscribed from user channel: {}", channel);
        }
    }

    @PreDestroy
    public void cleanup() {
        log.info("RedisWebSocketBridge shutting down, cleaning up {} board + {} user subscriptions",
                activeBoardListeners.size(), activeUserListeners.size());
        activeBoardListeners.forEach((boardId, listener) ->
                listenerContainer.removeMessageListener(listener, new ChannelTopic("ws:board:" + boardId)));
        activeUserListeners.forEach((userId, listener) ->
                listenerContainer.removeMessageListener(listener, new ChannelTopic("ws:user:" + userId)));
        activeBoardListeners.clear();
        activeUserListeners.clear();
        boardSubscriptions.clear();
        userSubscriptions.clear();
    }

    private void publish(String channel, String destination, Object payload) {
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            RedisWsMessage msg = new RedisWsMessage(
                    instanceIdHolder.getInstanceId(), destination, payloadJson
            );
            redisTemplate.convertAndSend(channel, objectMapper.writeValueAsString(msg));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize WebSocket message for Redis: destination={}", destination, e);
        }
    }

    private MessageListener createMessageListener() {
        return (Message message, byte[] pattern) -> {
            try {
                String body = new String(message.getBody(), StandardCharsets.UTF_8);
                RedisWsMessage msg = objectMapper.readValue(body, RedisWsMessage.class);

                // Skip messages from this instance (already delivered locally)
                if (instanceIdHolder.getInstanceId().equals(msg.instanceId())) {
                    return;
                }

                // Deserialize payload and forward to local STOMP subscribers
                Object payload = objectMapper.readValue(msg.payload(), Object.class);
                messagingTemplate.convertAndSend(msg.destination(), payload);
                log.trace("Redis relay: destination={}", msg.destination());
            } catch (Exception e) {
                log.error("Failed to process Redis WebSocket message", e);
            }
        };
    }
}
