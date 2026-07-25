-- Yjs 협업 상태(yjs_state) 컬럼 타입을 bytea로 정규화한다.
--
-- 배경: NoteCollabState/NoteDraftArchive 엔티티가 byte[]에 @Lob을 달고 있어
-- Hibernate 6이 이를 PostgreSQL oid(large object)로 매핑했고, ddl-auto=update가
-- 매 부팅마다 기존 bytea 컬럼을 'alter column ... set data type oid'로 바꾸려다
-- "cannot be cast automatically to type oid"로 실패했다. 엔티티는 @JdbcTypeCode
-- (VARBINARY)로 수정해 bytea로 매핑되도록 했고, 이 마이그레이션은 혹시라도 컬럼이
-- oid로 넘어간 환경을 bytea로 되돌려 스키마를 명시적으로 일치시킨다.
--
-- 멱등: 이미 bytea면 아무 것도 하지 않고, oid인 경우에만 변환한다.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'note_collab_states'
          AND column_name = 'yjs_state'
          AND udt_name = 'oid'
    ) THEN
        ALTER TABLE note_collab_states
            ALTER COLUMN yjs_state TYPE bytea USING lo_get(yjs_state);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'note_draft_archives'
          AND column_name = 'yjs_state'
          AND udt_name = 'oid'
    ) THEN
        ALTER TABLE note_draft_archives
            ALTER COLUMN yjs_state TYPE bytea USING lo_get(yjs_state);
    END IF;
END $$;
