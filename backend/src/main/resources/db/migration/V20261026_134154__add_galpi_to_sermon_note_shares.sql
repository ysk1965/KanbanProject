-- 공개 사본에 「이 노트를 이번 주 갈피로 꽂았다」 표시 — 내용이 아니라서 private 사본에도 보인다
-- 계약서: docs/Tech/sermon-groups-api.md

DO $$ BEGIN
    ALTER TABLE sermon_note_shares ADD COLUMN galpi BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
