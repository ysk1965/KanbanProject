-- 폐기(discard)된 노트 협업 드래프트의 Yjs 상태를 보존하여 복구(되돌리기)를 가능하게 한다.
-- Java 백엔드에는 Yjs CRDT가 없어 머티리얼라이즈가 불가하므로 원본 바이너리 블롭을 그대로 보존한다.
-- note당 최신 폐기본 1개만 유지(note_id PK upsert). 노트 삭제 시 함께 정리(CASCADE).
CREATE TABLE IF NOT EXISTS note_draft_archives (
    note_id      VARCHAR(36) PRIMARY KEY,
    yjs_state    BYTEA,
    discarded_by VARCHAR(36),
    discarded_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_nda_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
