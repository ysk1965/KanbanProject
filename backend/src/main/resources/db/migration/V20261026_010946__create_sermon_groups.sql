-- 설교 노트 「모임」: 모임 · 멤버 · 설교 자리 · 공개 사본 · 반응 · 같이 써요
-- 계약서: docs/Tech/sermon-groups-api.md

CREATE TABLE IF NOT EXISTS sermon_groups (
    id                VARCHAR(36)  PRIMARY KEY,
    name              VARCHAR(60)  NOT NULL,
    kind              VARCHAR(20)  NOT NULL,          -- church / study / family / friend / team
    meet_dow          INTEGER,                        -- 0=일 … 6=토
    meet_time         VARCHAR(5),                     -- "19:00"
    services          JSONB        NOT NULL,          -- 예배표
    invite_code       VARCHAR(12),                    -- null = 링크 꺼짐
    invite_expires_at TIMESTAMP,                      -- null = 무기한
    join_approval     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(36),
    created_at        TIMESTAMP    NOT NULL,
    updated_at        TIMESTAMP,
    deleted_at        TIMESTAMP                       -- 소프트 삭제
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sg_invite_code') THEN
        ALTER TABLE sermon_groups ADD CONSTRAINT uq_sg_invite_code UNIQUE (invite_code);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS sermon_group_members (
    id                VARCHAR(36)  PRIMARY KEY,
    group_id          VARCHAR(36)  NOT NULL REFERENCES sermon_groups(id) ON DELETE CASCADE,
    user_id           VARCHAR(36)  NOT NULL,
    role              VARCHAR(20)  NOT NULL,          -- leader / co_leader / member
    status            VARCHAR(20)  NOT NULL,          -- pending / active
    display_name      VARCHAR(20)  NOT NULL,
    muted_service_ids JSONB        NOT NULL,          -- 내가 안 드리는 예배 id
    joined_at         TIMESTAMP    NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sgm_group_user') THEN
        ALTER TABLE sermon_group_members ADD CONSTRAINT uq_sgm_group_user UNIQUE (group_id, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sgm_user ON sermon_group_members(user_id);

CREATE TABLE IF NOT EXISTS sermon_sessions (
    id         VARCHAR(36)  PRIMARY KEY,
    group_id   VARCHAR(36)  NOT NULL REFERENCES sermon_groups(id) ON DELETE CASCADE,
    service_id VARCHAR(20),                           -- 예배표 밖 자리면 null
    date       DATE         NOT NULL,                 -- 교회 현지 날짜
    name       VARCHAR(60),                           -- 예배표 밖 자리 이름
    title      VARCHAR(200),
    preacher   VARCHAR(60),
    refs       JSONB        NOT NULL,                 -- ["44:5:12-14"]
    locked     BOOLEAN      NOT NULL DEFAULT FALSE,
    updated_by VARCHAR(36),
    opened_by  VARCHAR(36),
    created_at TIMESTAMP    NOT NULL,
    updated_at TIMESTAMP
);

-- service_id 가 null 인 행끼리는 충돌하지 않는다 (예배표 밖 자리는 여러 개 가능)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ss_group_service_date') THEN
        ALTER TABLE sermon_sessions ADD CONSTRAINT uq_ss_group_service_date UNIQUE (group_id, service_id, date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ss_group_date ON sermon_sessions(group_id, date);

CREATE TABLE IF NOT EXISTS sermon_note_shares (
    id         VARCHAR(36)  PRIMARY KEY,
    session_id VARCHAR(36)  NOT NULL REFERENCES sermon_sessions(id) ON DELETE CASCADE,
    group_id   VARCHAR(36)  NOT NULL REFERENCES sermon_groups(id) ON DELETE CASCADE,
    user_id    VARCHAR(36)  NOT NULL,
    note_id    VARCHAR(64),                           -- 클라이언트 노트 id (참고용)
    my_title   VARCHAR(200),
    heard      VARCHAR(10)  NOT NULL,                 -- live / video / other
    part       VARCHAR(10),
    private    BOOLEAN      NOT NULL DEFAULT FALSE,   -- 기록만 공개, 내용 비공개
    fields     JSONB,                                 -- private 면 null, 최대 64KB
    created_at TIMESTAMP    NOT NULL,
    updated_at TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sns_session_user') THEN
        ALTER TABLE sermon_note_shares ADD CONSTRAINT uq_sns_session_user UNIQUE (session_id, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sns_group_user ON sermon_note_shares(group_id, user_id);

CREATE TABLE IF NOT EXISTS sermon_reactions (
    id         VARCHAR(36)  PRIMARY KEY,
    share_id   VARCHAR(36)  NOT NULL REFERENCES sermon_note_shares(id) ON DELETE CASCADE,
    item_key   VARCHAR(64)  NOT NULL,                 -- 생각 id / "h:<ref>" / "note"
    user_id    VARCHAR(36)  NOT NULL,
    kind       VARCHAR(20)  NOT NULL,                 -- amen / curious / keeping
    created_at TIMESTAMP    NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sr_share_item_user_kind') THEN
        ALTER TABLE sermon_reactions
            ADD CONSTRAINT uq_sr_share_item_user_kind UNIQUE (share_id, item_key, user_id, kind);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sr_user ON sermon_reactions(user_id);

CREATE TABLE IF NOT EXISTS sermon_pokes (
    id         VARCHAR(36)  PRIMARY KEY,
    group_id   VARCHAR(36)  NOT NULL REFERENCES sermon_groups(id) ON DELETE CASCADE,
    from_user  VARCHAR(36)  NOT NULL,
    to_user    VARCHAR(36)  NOT NULL,
    week_start DATE         NOT NULL,
    session_id VARCHAR(36),
    created_at TIMESTAMP    NOT NULL,
    seen_at    TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sp_group_from_to_week') THEN
        ALTER TABLE sermon_pokes ADD CONSTRAINT uq_sp_group_from_to_week UNIQUE (group_id, from_user, to_user, week_start);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sp_group_to_week ON sermon_pokes(group_id, to_user, week_start);
