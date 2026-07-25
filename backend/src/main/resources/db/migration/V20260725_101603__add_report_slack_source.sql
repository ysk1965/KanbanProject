-- 자동 보고서의 "수집 소스"로 특정 슬랙 채널을 추가한다.
-- 발송 채널(slack_channel_id)과 별개다: 이건 봇이 "읽어올" 채널이다.
-- 읽기에는 channels:history/groups:history 스코프 + 봇의 채널 초대가 필요하다.

DO $$ BEGIN
    ALTER TABLE board_report_configs ADD COLUMN source_slack_enabled BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE board_report_configs ADD COLUMN source_slack_channel_id VARCHAR(40);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE board_report_configs ADD COLUMN source_slack_channel_name VARCHAR(100);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
