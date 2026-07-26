-- 발송 테스트 게이팅: 마지막으로 테스트에 성공한 발송 채널 id를 기록한다.
-- 이 값이 현재 발송 채널과 같을 때만 자동 예약(일일/주간)을 켤 수 있다.
DO $$ BEGIN
    ALTER TABLE board_report_configs ADD COLUMN test_passed_channel_id VARCHAR(40);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
