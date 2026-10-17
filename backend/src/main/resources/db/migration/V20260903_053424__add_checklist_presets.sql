-- 체크리스트 프리셋: 보드 스코프 (이름 + 항목 제목 목록)
-- 태스크에 적용 시 항목이 체크리스트로 복사 생성되고 tasks.preset_id에 라벨이 기록된다 (스냅샷 원칙).

-- 프리셋 테이블 (멱등)
CREATE TABLE IF NOT EXISTS checklist_presets (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(16),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checklist_preset_board_id ON checklist_presets(board_id);

-- 프리셋 항목 테이블 (멱등, 프리셋 삭제 시 함께 삭제)
CREATE TABLE IF NOT EXISTS checklist_preset_items (
    id VARCHAR(36) PRIMARY KEY,
    preset_id VARCHAR(36) NOT NULL REFERENCES checklist_presets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_checklist_preset_item_preset_id ON checklist_preset_items(preset_id);

-- tasks.preset_id: 적용된 프리셋 라벨 (FK 없음 — 프리셋 삭제 시 서비스 레이어에서 null 정리)
DO $$ BEGIN
    ALTER TABLE tasks ADD COLUMN preset_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_preset_id ON tasks(preset_id);
