package com.kanban.domain.diary;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DiaryVoiceSettingsRepository extends JpaRepository<DiaryVoiceSettings, String> {
    Optional<DiaryVoiceSettings> findByUserId(String userId);
}
