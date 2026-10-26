-- 「나의 갈피」 이름표에 「내 예배표」 — JSON 배열 [{id, name, slots[{dow,start,end,part}], my_part, auto, galpi, groups[{group_id, service_id}]}]
-- null = 아직 정한 적 없음 (응답은 []). 계약서: docs/Tech/sermon-profile-api.md

DO $$ BEGIN
    ALTER TABLE sermon_profiles ADD COLUMN worship_services JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
