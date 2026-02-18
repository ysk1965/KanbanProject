-- V49: Add voice message support to diary

-- Add audio fields to diary_messages
ALTER TABLE diary_messages
    ADD COLUMN audio_url VARCHAR(500),
    ADD COLUMN audio_duration_seconds INTEGER;

-- Voice settings per user
CREATE TABLE diary_voice_settings (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    voice_type VARCHAR(20) NOT NULL DEFAULT 'nova',
    auto_play BOOLEAN NOT NULL DEFAULT true,
    speed DECIMAL(2,1) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_diary_voice_settings_user UNIQUE (user_id)
);

CREATE INDEX idx_diary_voice_settings_user ON diary_voice_settings(user_id);
