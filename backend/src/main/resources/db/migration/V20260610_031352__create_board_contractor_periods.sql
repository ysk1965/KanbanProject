-- 외주(board_contractors) 다중 계약 기간 이력 테이블
-- 기존 단일 start_date/end_date 컬럼은 데이터 이관 후에도 남겨둔다(무중단, 추후 cleanup 가능).

CREATE TABLE IF NOT EXISTS board_contractor_periods (
    id            VARCHAR(36) PRIMARY KEY,
    contractor_id VARCHAR(36) NOT NULL,
    start_date    DATE,
    end_date      DATE,
    created_at    TIMESTAMP   NOT NULL,
    CONSTRAINT fk_bcp_contractor
        FOREIGN KEY (contractor_id) REFERENCES board_contractors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bcp_contractor_id ON board_contractor_periods(contractor_id);

-- 기존 단일 기간(start_date 또는 end_date 가 설정된 외주)을 첫 계약 기간으로 백필 (멱등)
INSERT INTO board_contractor_periods (id, contractor_id, start_date, end_date, created_at)
SELECT gen_random_uuid()::text, c.id, c.start_date, c.end_date, CURRENT_TIMESTAMP
FROM board_contractors c
WHERE (c.start_date IS NOT NULL OR c.end_date IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1 FROM board_contractor_periods p WHERE p.contractor_id = c.id
  );
