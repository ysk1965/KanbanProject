-- 보고서 자동 수집 파일을 보고서별 폴더로 묶기 위한 컬럼.
--
-- system_key : 시스템이 관리하는 폴더 식별자. 'REPORT_ROOT' | 'REPORT_MONTH:2026-07' | 'REPORT_UNSORTED'
--              이름이 아니라 이 키로 찾으므로 사용자가 폴더 이름을 바꿔도 동작한다.
-- report_id  : 이 폴더의 주인 보고서(weekly_reports.id). 보고서 삭제 시 폴더를 함께 휴지통으로 내린다.
--              weekly_reports 는 하드 삭제되고 폴더는 휴지통에 남아야 하므로 FK 는 걸지 않는다
--              (storage_file.board_id 와 같은 느슨한 참조 방식).

DO $$ BEGIN
    ALTER TABLE storage_folder ADD COLUMN system_key VARCHAR(60);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE storage_folder ADD COLUMN report_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_storage_folder_system_key
    ON storage_folder(board_id, system_key);

CREATE INDEX IF NOT EXISTS idx_storage_folder_report
    ON storage_folder(report_id);
