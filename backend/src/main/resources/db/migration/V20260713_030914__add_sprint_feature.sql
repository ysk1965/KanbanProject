-- Sprint feature (Phase 1)
-- 마일스톤 안의 선택형 스프린트: sprints 테이블 + checklist_items 스프린트 컬럼 + milestones 토글
-- 멱등 작성 (IF NOT EXISTS / DO $$ 가드). local(H2)은 Flyway off + ddl-auto라 무영향, dev/prod만 적용.

-- 1) sprints 테이블
CREATE TABLE IF NOT EXISTS sprints (
    id              VARCHAR(36) PRIMARY KEY,
    milestone_id    VARCHAR(36) NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    sequence_no     INT NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    start_date      DATE,
    end_date        DATE,
    completed_count INT NOT NULL DEFAULT 0,
    total_count     INT NOT NULL DEFAULT 0,
    archived_at     TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sprints_milestone ON sprints(milestone_id);

-- 2) checklist_items 스프린트 컬럼 (담긴 스프린트 + 프레임 내 위치 + 완료자)
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS sprint_id    VARCHAR(36);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS sprint_stage VARCHAR(20);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS completed_by VARCHAR(36); -- B안: 완료 체크한 유저
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_checklist_sprint') THEN
        ALTER TABLE checklist_items ADD CONSTRAINT fk_checklist_sprint
            FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_checklist_completed_by') THEN
        ALTER TABLE checklist_items ADD CONSTRAINT fk_checklist_completed_by
            FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_checklist_sprint ON checklist_items(sprint_id);

-- 3) milestones 스프린트 토글 (A안)
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS sprint_enabled BOOLEAN NOT NULL DEFAULT FALSE;
