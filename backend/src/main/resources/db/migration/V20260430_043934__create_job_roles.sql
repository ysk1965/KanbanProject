-- 보드별 커스텀 직군(Job Role) 테이블
-- 권한 Role(Owner/Admin/Member/Viewer)과 별개로 개발/기획/UI/연출 등 직무 그룹 표현
CREATE TABLE IF NOT EXISTS job_roles (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20),
    icon VARCHAR(30),
    display_order INTEGER,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    CONSTRAINT uk_job_roles_board_name UNIQUE (board_id, name)
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_roles_board') THEN
        ALTER TABLE job_roles
          ADD CONSTRAINT fk_job_roles_board
          FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_roles_board_id ON job_roles(board_id);
CREATE INDEX IF NOT EXISTS idx_job_roles_board_order ON job_roles(board_id, display_order);
