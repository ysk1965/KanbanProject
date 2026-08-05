-- 자동수정 큐를 JIRA 이슈 전용에서 "맥에 맡기는 작업" 일반으로 넓힌다.
--
-- 큐를 나누지 않는 이유: 실행 주체는 Unity Editor가 떠 있는 맥 한 대뿐이고, "한 번에 한 건"이라는
-- 직렬 보장이 테이블 하나 안에서 성립해야 한다. 큐를 둘로 나누면 두 큐가 서로의 사정을 모른 채
-- 각자 한 건씩 내주고, 그걸 막으려고 조정자를 두면 GitHub Actions를 걷어내며 없앤
-- "서버가 러너 사정을 추측하는 구조"가 되돌아온다.

-- 1) 식별자 일반화: jira_issue_key → job_key
--    이 값은 화면·러너 명세·PR 제목·브랜치 이름에 전부 노출되는 1급 식별자다.
--    MANUAL-… 이 들어 있는 컬럼 이름이 jira_issue_key면 이 코드를 읽는 사람이 매번 걸린다.
--    (인덱스는 컬럼 rename을 자동으로 따라간다)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'jira_autofix_jobs' AND column_name = 'jira_issue_key')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'jira_autofix_jobs' AND column_name = 'job_key') THEN
        ALTER TABLE jira_autofix_jobs RENAME COLUMN jira_issue_key TO job_key;
    END IF;
END $$;

-- 2) 출처. 기존 행은 전부 JIRA다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN job_kind VARCHAR(10) NOT NULL DEFAULT 'JIRA';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_jira_autofix_job_kind') THEN
        ALTER TABLE jira_autofix_jobs ADD CONSTRAINT ck_jira_autofix_job_kind
            CHECK (job_kind IN ('JIRA', 'MANUAL'));
    END IF;
END $$;

-- 3) 사람이 쓴 지시문. 러너 프롬프트의 본문이 된다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN instruction TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4) 누가 맡겼는가. 임의 지시문이 사내 맥에서 실행되므로 감사 경로가 있어야 한다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN created_by VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5) 브랜치 이름을 큐에 담는 시점에 확정한다.
--    매번 조립하면 "러너가 실제로 push한 브랜치"와 화면이 어긋날 여지가 생기고,
--    무엇보다 job id를 섞어야 재시도 시 remote 브랜치와 non-fast-forward로 부딪히지 않는다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN branch_name VARCHAR(200);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6) 위임 범위. NULL이면 태스크 전체, 값이 있으면 그 체크리스트 항목만.
--    task_id는 이 경우에도 항상 채운다 — 프롬프트 맥락이 부모 태스크에서 나오기 때문이다
--    (ChecklistItem에는 설명 필드가 없어 제목 한 줄이 전부다).
--    FK를 걸지 않는다: 항목은 소프트 삭제되는데, 삭제된 항목으로 돌린 작업의 이력은 남아야 한다.
DO $$ BEGIN
    ALTER TABLE jira_autofix_jobs ADD COLUMN checklist_item_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 7) 조회 경로 — 우선순위 정렬 · 대상 중복 확인 · 태스크 상세의 항목별 상태
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_kind
    ON jira_autofix_jobs(board_id, job_kind, status);
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_task
    ON jira_autofix_jobs(board_id, task_id);
CREATE INDEX IF NOT EXISTS idx_jira_autofix_job_checklist
    ON jira_autofix_jobs(board_id, checklist_item_id);
