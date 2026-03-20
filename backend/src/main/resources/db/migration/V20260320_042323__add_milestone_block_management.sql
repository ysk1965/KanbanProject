-- blocks 테이블에 milestone_id 추가
DO $$ BEGIN
    ALTER TABLE blocks ADD COLUMN milestone_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_blocks_milestone_id') THEN
        ALTER TABLE blocks ADD CONSTRAINT fk_blocks_milestone_id
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blocks_milestone_id ON blocks(milestone_id);

-- milestone_block_configs 테이블 (보드 레벨 블록의 마일스톤별 숨김 설정)
CREATE TABLE IF NOT EXISTS milestone_block_configs (
    id VARCHAR(36) PRIMARY KEY,
    milestone_id VARCHAR(36) NOT NULL,
    block_id VARCHAR(36) NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT fk_mbc_milestone FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
    CONSTRAINT fk_mbc_block FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE,
    CONSTRAINT uq_mbc_milestone_block UNIQUE (milestone_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_mbc_milestone_id ON milestone_block_configs(milestone_id);
CREATE INDEX IF NOT EXISTS idx_mbc_block_id ON milestone_block_configs(block_id);
