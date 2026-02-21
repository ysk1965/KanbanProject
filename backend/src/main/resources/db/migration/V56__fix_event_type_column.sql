-- V54 마이그레이션이 실패했거나 Hibernate ddl-auto가 실패한 경우를 위한 보정
-- event_type 컬럼이 없으면 추가, 있으면 무시
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'personal_events' AND column_name = 'event_type'
    ) THEN
        ALTER TABLE personal_events ADD COLUMN event_type VARCHAR(20);
        UPDATE personal_events SET event_type = 'SCHEDULE' WHERE event_type IS NULL;
        ALTER TABLE personal_events ALTER COLUMN event_type SET NOT NULL;
        ALTER TABLE personal_events ALTER COLUMN event_type SET DEFAULT 'SCHEDULE';
    END IF;
END $$;
