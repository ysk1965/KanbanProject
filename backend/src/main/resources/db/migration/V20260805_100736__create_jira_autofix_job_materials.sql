-- 맥에 맡길 때 사람이 직접 올린 스크린샷·재현 영상.
-- 댓글 첨부와 분리한다: 같은 태스크를 다른 그림과 함께 다시 맡기는 것이 정상 흐름이라,
-- 댓글에 저장하면 다음 위임이 지난 위임의 그림까지 끌고 간다.
-- 한 번의 위임이 체크리스트 항목 N건으로 갈라지면 같은 s3_key를 N행이 가리킨다(객체는 하나).

CREATE TABLE IF NOT EXISTS jira_autofix_job_materials (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    original_file_name VARCHAR(500),
    s3_key VARCHAR(500) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autofix_job_material_job
    ON jira_autofix_job_materials(job_id);

-- 작업이 지워지면 자료도 함께 사라져야 한다 — 남으면 어떤 작업 것인지 알 수 없는 행이 된다.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_autofix_job_material_job') THEN
        ALTER TABLE jira_autofix_job_materials
            ADD CONSTRAINT fk_autofix_job_material_job
            FOREIGN KEY (job_id) REFERENCES jira_autofix_jobs(id) ON DELETE CASCADE;
    END IF;
END $$;
