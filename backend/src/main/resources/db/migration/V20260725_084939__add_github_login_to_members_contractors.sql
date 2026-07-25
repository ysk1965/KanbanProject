-- 커밋 author(GitHub 로그인)와 보드 멤버/외주를 연결하기 위한 github_login 컬럼 추가.
-- 리포트의 기능별 커밋 추적에서 commit.authorLogin 매칭에 사용된다.

-- board_members.github_login (멱등)
DO $$ BEGIN
    ALTER TABLE board_members ADD COLUMN github_login VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- board_contractors.github_login (멱등)
DO $$ BEGIN
    ALTER TABLE board_contractors ADD COLUMN github_login VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
