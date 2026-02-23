package com.kanban.domain.notification.service;

import com.kanban.domain.notification.DeviceToken;
import com.kanban.domain.notification.DeviceTokenRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DeviceTokenService {

    private final DeviceTokenRepository deviceTokenRepository;
    private final UserRepository userRepository;

    @Transactional
    public void registerToken(String userId, String token, String platform, String deviceInfo) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        deviceTokenRepository.findByToken(token).ifPresentOrElse(
                existing -> existing.updateToken(token),
                () -> {
                    DeviceToken deviceToken = DeviceToken.builder()
                            .user(user)
                            .token(token)
                            .platform(DeviceToken.Platform.valueOf(platform.toUpperCase()))
                            .deviceInfo(deviceInfo)
                            .build();
                    deviceTokenRepository.save(deviceToken);
                }
        );
    }

    @Transactional
    public void unregisterToken(String token) {
        deviceTokenRepository.deleteByToken(token);
    }

    @Transactional
    public void unregisterAllForUser(String userId) {
        deviceTokenRepository.deleteByUserId(userId);
    }
}
