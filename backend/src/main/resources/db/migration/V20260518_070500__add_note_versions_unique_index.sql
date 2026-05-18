-- note_versions(note_id, version_number) UNIQUE 제약.
--
-- 배경: 기존 NoteService/OrgNoteService는 `SELECT MAX(version_number)` 후
-- `count + 1`로 채번한다. 동시 명시 저장이 겹치면 같은 version_number 로
-- 두 행이 들어갈 수 있어, 버전 히스토리/비교 뷰에서 충돌이 생긴다.
--
-- 본 마이그레이션은:
--   1) 이미 중복이 존재하면 created_at 순서로 version_number 를 재할당하고
--   2) (note_id, version_number) 에 UNIQUE 인덱스를 건다.
-- 이후 서비스 레이어는 unique violation 발생 시 max+1 채번을 재시도하여
-- DB 가 진실 공급원이 되도록 한다.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM note_versions
        GROUP BY note_id, version_number
        HAVING COUNT(*) > 1
    ) THEN
        WITH renumbered AS (
            SELECT
                id,
                ROW_NUMBER() OVER (PARTITION BY note_id ORDER BY created_at, id) AS new_version
            FROM note_versions
        )
        UPDATE note_versions nv
        SET version_number = r.new_version
        FROM renumbered r
        WHERE nv.id = r.id
          AND nv.version_number <> r.new_version;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_note_versions_note_id_version
    ON note_versions(note_id, version_number);
