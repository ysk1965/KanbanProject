-- 보드 화면 복잡도 모델 (docs/Design/level-model.html)
--
--  ui_level   : 시간을 몇 겹으로 묶는가 — 사다리. 1=안 묶음 / 2=주기 / 3=단계▸주기
--  ui_options : 레벨과 무관한 직교 옵션 집합(쉼표 구분) — members,review,timeblock,jira
--
-- 기존 보드는 지금 화면 그대로여야 하므로 최고 레벨 + 전 옵션으로 채운다.
-- 신규 보드만 애플리케이션에서 레벨 1로 생성한다.

DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN ui_level SMALLINT NOT NULL DEFAULT 3;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE boards ADD COLUMN ui_options VARCHAR(255) NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_boards_ui_level') THEN
        ALTER TABLE boards ADD CONSTRAINT ck_boards_ui_level CHECK (ui_level BETWEEN 1 AND 3);
    END IF;
END $$;

-- 백필 (멱등)
UPDATE boards SET ui_level = 3 WHERE ui_level IS NULL OR ui_level NOT BETWEEN 1 AND 3;
UPDATE boards SET ui_options = 'members,review,timeblock,jira' WHERE ui_options IS NULL OR ui_options = '';
