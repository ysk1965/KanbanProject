-- note_likes.note_id FK 에 ON DELETE CASCADE 부여 (휴지통 영구 삭제 시 좋아요가 남아 FK 위반하던 문제의 안전망).
-- 코드에서도 NoteHardDeleteSupport 가 명시적으로 note_likes 를 지우지만, DB 레벨에서 한 번 더 보장한다.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_note_like_note') THEN
        ALTER TABLE note_likes DROP CONSTRAINT fk_note_like_note;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_note_like_note') THEN
        ALTER TABLE note_likes
            ADD CONSTRAINT fk_note_like_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE;
    END IF;
END $$;
