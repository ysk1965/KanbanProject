-- Meeting 테이블 생성
CREATE TABLE meetings (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    title VARCHAR(200) NOT NULL,
    meeting_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    memo TEXT,
    color VARCHAR(7) DEFAULT '#8B5CF6',
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    CONSTRAINT fk_meeting_board FOREIGN KEY (board_id) REFERENCES boards(id),
    CONSTRAINT fk_meeting_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_meeting_board_date ON meetings(board_id, meeting_date);

-- schedule_blocks에 meeting_id FK 추가
ALTER TABLE schedule_blocks ADD COLUMN meeting_id VARCHAR(36);
ALTER TABLE schedule_blocks ADD CONSTRAINT fk_schedule_meeting
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
CREATE INDEX idx_schedule_meeting ON schedule_blocks(meeting_id);
