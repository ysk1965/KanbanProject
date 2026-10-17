-- AI 다이어리 기능 제거: 관련 테이블 삭제 (멱등)
DROP TABLE IF EXISTS diary_messages;
DROP TABLE IF EXISTS diary_voice_settings;
DROP TABLE IF EXISTS diary_entries;
