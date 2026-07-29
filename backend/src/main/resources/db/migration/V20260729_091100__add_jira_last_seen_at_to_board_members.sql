-- 스프린트 JIRA 뷰 "신규 이슈" 뱃지 기준선.
-- 멤버가 JIRA 탭에서 마지막으로 이슈 목록을 확인한 시각(UTC).
-- NULL = 아직 한 번도 안 봄 → 서비스에서 최초 조회 시 now로 초기화(전체가 신규로 뜨는 것 방지).
DO $$ BEGIN
    ALTER TABLE board_members ADD COLUMN jira_last_seen_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
