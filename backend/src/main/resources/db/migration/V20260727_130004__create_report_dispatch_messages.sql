-- 자동 보고서가 슬랙에 실제로 게시한 메시지(채널·ts)를 기록한다.
-- 보고서를 삭제할 때 이 기록으로 chat.delete를 호출해 슬랙 메시지까지 회수한다.
-- 한 보고서가 여러 채널로 나가므로 report_id : row = 1 : N.
CREATE TABLE IF NOT EXISTS report_dispatch_messages (
    id           VARCHAR(36)  PRIMARY KEY,
    board_id     VARCHAR(36)  NOT NULL,
    report_id    VARCHAR(36)  NOT NULL,
    channel_id   VARCHAR(40)  NOT NULL,
    channel_name VARCHAR(255),
    message_ts   VARCHAR(40)  NOT NULL,
    created_at   TIMESTAMP    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_dispatch_report ON report_dispatch_messages(report_id);
CREATE INDEX IF NOT EXISTS idx_report_dispatch_board ON report_dispatch_messages(board_id);
