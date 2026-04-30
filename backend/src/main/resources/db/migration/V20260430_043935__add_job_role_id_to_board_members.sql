-- BoardMember에 직군 FK 추가 (nullable)
DO $$ BEGIN
    ALTER TABLE board_members ADD COLUMN job_role_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_members_job_role') THEN
        ALTER TABLE board_members
          ADD CONSTRAINT fk_board_members_job_role
          FOREIGN KEY (job_role_id) REFERENCES job_roles(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_board_members_job_role_id ON board_members(job_role_id);
