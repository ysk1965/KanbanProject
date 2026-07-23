-- 자동 보고서 발송 (일일/주간) — 설정 + 연동 + 발송 이력
--
-- 설계 원칙: 인증(연결)과 선택(대상)을 분리한다.
--   연결  = github_installations / confluence_integration_configs  (조직 또는 보드 단위)
--   선택  = board_github_repos / board_confluence_sources          (보드 단위)
-- jira_integration_configs는 건드리지 않는다 — Confluence는 도메인이 달라 cloudId를 공유할 수 없다.

-- ─────────────────────────────────────────────
-- 1. 보드별 발송 설정
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_report_configs (
    id                        VARCHAR(36) PRIMARY KEY,
    board_id                  VARCHAR(36) NOT NULL,

    daily_enabled             BOOLEAN     NOT NULL DEFAULT FALSE,
    daily_send_hour_utc       INTEGER     NOT NULL DEFAULT 0,
    daily_send_minute_utc     INTEGER     NOT NULL DEFAULT 0,
    daily_last_sent_at        TIMESTAMP,

    weekly_enabled            BOOLEAN     NOT NULL DEFAULT FALSE,
    weekly_send_hour_utc      INTEGER     NOT NULL DEFAULT 0,
    weekly_send_minute_utc    INTEGER     NOT NULL DEFAULT 0,
    weekly_day_of_week        INTEGER     NOT NULL DEFAULT 6,
    weekly_last_sent_at       TIMESTAMP,

    timezone                  VARCHAR(60) NOT NULL DEFAULT 'Asia/Seoul',
    language                  VARCHAR(10) NOT NULL DEFAULT 'ko',
    slack_channel_id          VARCHAR(40),
    slack_channel_name        VARCHAR(100),

    source_github_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    source_kanban_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    source_confluence_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    share_link_enabled        BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at                TIMESTAMP   NOT NULL,
    updated_at                TIMESTAMP,
    CONSTRAINT uk_board_report_config_board UNIQUE (board_id)
);

CREATE INDEX IF NOT EXISTS idx_board_report_config_daily
    ON board_report_configs (daily_enabled, daily_send_hour_utc, daily_send_minute_utc);
CREATE INDEX IF NOT EXISTS idx_board_report_config_weekly
    ON board_report_configs (weekly_enabled, weekly_send_hour_utc, weekly_send_minute_utc);

-- ─────────────────────────────────────────────
-- 2. GitHub App 설치 (연결) — 토큰은 저장하지 않는다.
--    installation token은 1시간 만료라 앱 private key로 매번 새로 발급받는다.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS github_installations (
    id                   VARCHAR(36) PRIMARY KEY,
    board_id             VARCHAR(36),
    organization_id      VARCHAR(36),
    scope                VARCHAR(20)  NOT NULL,
    installation_id      VARCHAR(40)  NOT NULL,
    account_login        VARCHAR(100) NOT NULL,
    account_type         VARCHAR(20),
    installed_by         VARCHAR(36),
    status               VARCHAR(30)  NOT NULL DEFAULT 'TARGET_NOT_SELECTED',
    last_error           TEXT,
    consecutive_failures INTEGER      NOT NULL DEFAULT 0,
    active               BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP    NOT NULL,
    updated_at           TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_github_install_board
    ON github_installations (board_id);
CREATE INDEX IF NOT EXISTS idx_github_install_organization
    ON github_installations (organization_id);

-- board_id / organization_id 중 하나만 채워지므로 부분 유니크 인덱스를 쓴다.
-- (일반 UNIQUE는 NULL을 중복으로 보지 않아 같은 설치가 여러 번 들어올 수 있다)
CREATE UNIQUE INDEX IF NOT EXISTS uk_github_install_board
    ON github_installations (installation_id, board_id) WHERE board_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_github_install_org
    ON github_installations (installation_id, organization_id) WHERE organization_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 3. 보드별 저장소 선택 (대상)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_github_repos (
    id                   VARCHAR(36)  PRIMARY KEY,
    board_id             VARCHAR(36)  NOT NULL,
    installation_id      VARCHAR(36)  NOT NULL,
    repo_full_name       VARCHAR(200) NOT NULL,
    branch               VARCHAR(200),
    exclude_authors_json TEXT,
    active               BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP    NOT NULL,
    updated_at           TIMESTAMP,
    CONSTRAINT uk_board_github_repo UNIQUE (board_id, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_board_github_repo_board
    ON board_github_repos (board_id);

-- ─────────────────────────────────────────────
-- 4. Confluence 연결 — JIRA와 완전히 독립. 자기 cloudId/baseUrl/토큰을 갖는다.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS confluence_integration_configs (
    id                      VARCHAR(36)  PRIMARY KEY,
    board_id                VARCHAR(36),
    organization_id         VARCHAR(36),
    scope                   VARCHAR(20)  NOT NULL,
    auth_type               VARCHAR(20)  NOT NULL DEFAULT 'OAUTH_3LO',
    cloud_id                VARCHAR(100),
    base_url                VARCHAR(300),
    site_name               VARCHAR(200),
    account_email           VARCHAR(200),
    access_token_encrypted  TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at        TIMESTAMP,
    connected_by            VARCHAR(36),
    status                  VARCHAR(30)  NOT NULL DEFAULT 'TARGET_NOT_SELECTED',
    last_error              TEXT,
    consecutive_failures    INTEGER      NOT NULL DEFAULT 0,
    active                  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMP    NOT NULL,
    updated_at              TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_confluence_config_board
    ON confluence_integration_configs (board_id);
CREATE INDEX IF NOT EXISTS idx_confluence_config_organization
    ON confluence_integration_configs (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_confluence_config_board
    ON confluence_integration_configs (board_id) WHERE board_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_confluence_config_org
    ON confluence_integration_configs (organization_id) WHERE organization_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 5. 보드별 스페이스·식별 규칙 (대상)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_confluence_sources (
    id             VARCHAR(36)  PRIMARY KEY,
    board_id       VARCHAR(36)  NOT NULL,
    config_id      VARCHAR(36)  NOT NULL,
    space_key      VARCHAR(100) NOT NULL,
    space_name     VARCHAR(200),
    match_rule     VARCHAR(20)  NOT NULL DEFAULT 'LABEL',
    label          VARCHAR(200),
    parent_page_id VARCHAR(60),
    title_pattern  VARCHAR(200),
    active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    NOT NULL,
    updated_at     TIMESTAMP,
    CONSTRAINT uk_board_confluence_space UNIQUE (board_id, space_key)
);

CREATE INDEX IF NOT EXISTS idx_board_confluence_board
    ON board_confluence_sources (board_id);

-- ─────────────────────────────────────────────
-- 6. 발송 이력
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_delivery_logs (
    id                 VARCHAR(36) PRIMARY KEY,
    board_id           VARCHAR(36) NOT NULL,
    report_id          VARCHAR(36),
    report_type        VARCHAR(30) NOT NULL,
    status             VARCHAR(20) NOT NULL,
    slack_channel_id   VARCHAR(40),
    source_status_json TEXT,
    error_message      TEXT,
    attempt_count      INTEGER     NOT NULL DEFAULT 1,
    created_at         TIMESTAMP   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_delivery_board
    ON report_delivery_logs (board_id);
CREATE INDEX IF NOT EXISTS idx_report_delivery_created
    ON report_delivery_logs (created_at);

-- ─────────────────────────────────────────────
-- 7. weekly_reports 확장
--    자동 생성 보고서는 생성 주체가 없으므로 generated_by의 NOT NULL을 푼다.
-- ─────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE weekly_reports ADD COLUMN content_json TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE weekly_reports ADD COLUMN source_status_json TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE weekly_reports ADD COLUMN share_token VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE weekly_reports ADD COLUMN share_expires_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_weekly_report_share_token
    ON weekly_reports (share_token) WHERE share_token IS NOT NULL;

ALTER TABLE weekly_reports ALTER COLUMN generated_by DROP NOT NULL;
