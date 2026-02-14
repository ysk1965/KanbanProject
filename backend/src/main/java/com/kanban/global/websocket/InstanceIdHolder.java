package com.kanban.global.websocket;

import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Holds a unique instance ID generated at application startup.
 * Used for Redis Pub/Sub self-message filtering in multi-instance environments.
 * EB instance replacement = new UUID (no persistence needed).
 */
@Component
public class InstanceIdHolder {

    private final String instanceId = UUID.randomUUID().toString();

    public String getInstanceId() {
        return instanceId;
    }
}
