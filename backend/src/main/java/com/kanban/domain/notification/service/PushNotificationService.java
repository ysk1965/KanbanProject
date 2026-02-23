package com.kanban.domain.notification.service;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.*;
import com.kanban.domain.notification.DeviceToken;
import com.kanban.domain.notification.DeviceTokenRepository;
import com.kanban.domain.notification.Notification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PushNotificationService {

    private final DeviceTokenRepository deviceTokenRepository;

    @Async
    @Transactional(readOnly = true)
    public void sendPushForNotification(Notification notification) {
        if (FirebaseApp.getApps().isEmpty()) {
            return; // Firebase not configured
        }

        String recipientId = notification.getRecipient().getId();
        List<DeviceToken> tokens = deviceTokenRepository.findByUserId(recipientId);
        if (tokens.isEmpty()) return;

        for (DeviceToken deviceToken : tokens) {
            try {
                Message message = Message.builder()
                        .setToken(deviceToken.getToken())
                        .setNotification(com.google.firebase.messaging.Notification.builder()
                                .setTitle(notification.getTitle())
                                .setBody(notification.getMessage())
                                .build())
                        .putData("type", notification.getType().name())
                        .putData("notification_id", notification.getId())
                        .putAllData(buildDeepLinkData(notification))
                        .setApnsConfig(ApnsConfig.builder()
                                .setAps(Aps.builder()
                                        .setSound("default")
                                        .setBadge(1)
                                        .build())
                                .build())
                        .setAndroidConfig(AndroidConfig.builder()
                                .setNotification(AndroidNotification.builder()
                                        .setSound("default")
                                        .build())
                                .build())
                        .build();

                FirebaseMessaging.getInstance().send(message);
                log.debug("[Push] Sent to user: {} platform: {}", recipientId, deviceToken.getPlatform());
            } catch (FirebaseMessagingException e) {
                if (e.getMessagingErrorCode() == MessagingErrorCode.UNREGISTERED
                        || e.getMessagingErrorCode() == MessagingErrorCode.INVALID_ARGUMENT) {
                    deviceTokenRepository.deleteByToken(deviceToken.getToken());
                    log.info("[Push] Removed invalid token for user: {}", recipientId);
                } else {
                    log.error("[Push] Failed to send to user: {}", recipientId, e);
                }
            }
        }
    }

    private Map<String, String> buildDeepLinkData(Notification notification) {
        Map<String, String> data = new HashMap<>();
        if (notification.getBoard() != null) {
            data.put("board_id", notification.getBoard().getId());
        }
        if (notification.getTaskId() != null) {
            data.put("task_id", notification.getTaskId());
        }
        if (notification.getNoteId() != null) {
            data.put("note_id", notification.getNoteId());
        }
        return data;
    }
}
