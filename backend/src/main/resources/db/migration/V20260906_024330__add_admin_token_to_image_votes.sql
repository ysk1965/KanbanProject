-- Top3 이미지 투표: 결과 조회·종료용 관리 토큰 (투표 토큰과 분리)

DO $$ BEGIN
    ALTER TABLE image_votes ADD COLUMN admin_token VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE image_votes SET admin_token = gen_random_uuid()::text WHERE admin_token IS NULL;

ALTER TABLE image_votes ALTER COLUMN admin_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iv_admin_token ON image_votes(admin_token);
