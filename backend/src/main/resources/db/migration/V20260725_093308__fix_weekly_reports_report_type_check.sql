-- weekly_reports.report_type CHECK 제약 갱신
--
-- 배경: weekly_reports는 V16에서 생성될 당시 ReportType enum이 TEAM/PERSONAL 뿐이었다.
--       @Enumerated(EnumType.STRING) 컬럼에 대해 Hibernate 6이 자동 생성한
--       CHECK 제약(weekly_reports_report_type_check)이 그 두 값만 허용한 채 dev/prod DB에 남아 있다.
--       이후 enum에 DAILY_DEV / WEEKLY_INTEGRATED가 추가됐지만 ddl-auto:update는 기존 CHECK 제약을
--       갱신하지 않으므로, 자동 보고서 발송 시 DataIntegrityViolationException(500)이 발생한다.
--
-- 조치: 낡은 제약을 제거하고 현재 ReportType enum 전체 값을 허용하도록 재생성한다. (멱등)

ALTER TABLE weekly_reports DROP CONSTRAINT IF EXISTS weekly_reports_report_type_check;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reports_report_type_check'
    ) THEN
        ALTER TABLE weekly_reports
            ADD CONSTRAINT weekly_reports_report_type_check
            CHECK (report_type IN ('TEAM', 'PERSONAL', 'DAILY_DEV', 'WEEKLY_INTEGRATED'));
    END IF;
END $$;
