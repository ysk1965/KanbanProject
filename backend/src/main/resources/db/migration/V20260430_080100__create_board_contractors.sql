-- 보드별 외주(Contractor) 테이블
-- 실제 User 계정 없이 워크로드 뷰의 별도 행으로 표시되는 가상 담당자.
-- manager_member_id 가 가리키는 BoardMember 가 해당 외주를 관리하며 알림을 대신 받음.
CREATE TABLE IF NOT EXISTS board_contractors (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    manager_member_id VARCHAR(36),
    job_role_id VARCHAR(36),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20),
    display_order INTEGER,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    CONSTRAINT uk_board_contractors_board_name UNIQUE (board_id, name)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_contractors_board') THEN
        ALTER TABLE board_contractors
          ADD CONSTRAINT fk_board_contractors_board
          FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_contractors_manager') THEN
        ALTER TABLE board_contractors
          ADD CONSTRAINT fk_board_contractors_manager
          FOREIGN KEY (manager_member_id) REFERENCES board_members(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_contractors_job_role') THEN
        ALTER TABLE board_contractors
          ADD CONSTRAINT fk_board_contractors_job_role
          FOREIGN KEY (job_role_id) REFERENCES job_roles(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_board_contractors_board_id ON board_contractors(board_id);
CREATE INDEX IF NOT EXISTS idx_board_contractors_manager_member_id ON board_contractors(manager_member_id);
CREATE INDEX IF NOT EXISTS idx_board_contractors_board_order ON board_contractors(board_id, display_order);
