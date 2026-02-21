package com.kanban.domain.notification;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, String> {

    List<DeviceToken> findByUserId(String userId);

    Optional<DeviceToken> findByToken(String token);

    void deleteByToken(String token);

    void deleteByUserId(String userId);
}
