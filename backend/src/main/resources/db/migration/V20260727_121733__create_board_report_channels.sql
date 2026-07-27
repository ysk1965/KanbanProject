-- 보고서 발송 채널을 여러 개로 확장.
--
-- 기존에는 board_report_configs.slack_channel_id 한 칸이 발송 대상 전부였다.
-- 이제 대상은 이 표가 결정하고, config의 slack_channel_id/name은 "대표 채널 미러"로만 남는다
-- (발송 이력 표시·구버전 클라이언트 호환용). 표가 비어 있으면 예전처럼 슬랙 설치 기본 채널로 나간다.
--
-- 테스트 통과는 채널마다 따로 기록한다(test_passed_at) — 새 채널을 추가하면 그 채널만
-- 다시 테스트하면 되고, 잘못된 채널이 섞인 채로 자동 예약이 켜지지 않는다.

CREATE TABLE IF NOT EXISTS board_report_channels (
    id                 VARCHAR(36)  PRIMARY KEY,
    config_id          VARCHAR(36)  NOT NULL,
    slack_channel_id   VARCHAR(40)  NOT NULL,
    slack_channel_name VARCHAR(100),
    sort_order         INTEGER      NOT NULL DEFAULT 0,
    test_passed_at     TIMESTAMP,
    created_at         TIMESTAMP    NOT NULL,
    updated_at         TIMESTAMP,
    CONSTRAINT uk_board_report_channel UNIQUE (config_id, slack_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_board_report_channel_config
    ON board_report_channels (config_id);

-- 기존 단일 채널 설정을 그대로 옮긴다. 테스트 통과 여부도 이어받아
-- 이미 예약이 돌던 보드가 다시 잠기지 않게 한다.
INSERT INTO board_report_channels (id, config_id, slack_channel_id, slack_channel_name,
                                   sort_order, test_passed_at, created_at, updated_at)
SELECT gen_random_uuid()::text,
       c.id,
       c.slack_channel_id,
       c.slack_channel_name,
       0,
       CASE WHEN c.test_passed_channel_id = c.slack_channel_id
            THEN COALESCE(c.updated_at, c.created_at) END,
       COALESCE(c.created_at, NOW()),
       c.updated_at
FROM board_report_configs c
WHERE c.slack_channel_id IS NOT NULL
  AND c.slack_channel_id <> ''
  AND NOT EXISTS (
      SELECT 1 FROM board_report_channels ch
      WHERE ch.config_id = c.id AND ch.slack_channel_id = c.slack_channel_id
  );
