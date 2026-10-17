-- Top3 이미지 투표 (자료실 플로우 보드)

CREATE TABLE IF NOT EXISTS image_votes (
    id VARCHAR(36) PRIMARY KEY,
    note_id VARCHAR(36) NOT NULL,
    board_id VARCHAR(36) NOT NULL,
    title VARCHAR(200) NOT NULL,
    token VARCHAR(36) NOT NULL UNIQUE,
    created_by VARCHAR(36) NOT NULL,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_iv_note ON image_votes(note_id);

CREATE TABLE IF NOT EXISTS image_vote_candidates (
    id VARCHAR(36) PRIMARY KEY,
    vote_id VARCHAR(36) NOT NULL,
    node_id VARCHAR(64),
    image_url TEXT NOT NULL,
    label VARCHAR(200),
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ivc_vote ON image_vote_candidates(vote_id);

CREATE TABLE IF NOT EXISTS image_vote_ballots (
    id VARCHAR(36) PRIMARY KEY,
    vote_id VARCHAR(36) NOT NULL,
    voter_name VARCHAR(100) NOT NULL,
    voter_key VARCHAR(64) NOT NULL,
    first_candidate_id VARCHAR(36) NOT NULL,
    second_candidate_id VARCHAR(36) NOT NULL,
    third_candidate_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ivb_vote ON image_vote_ballots(vote_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ivb_vote_voter') THEN
        ALTER TABLE image_vote_ballots ADD CONSTRAINT uq_ivb_vote_voter UNIQUE (vote_id, voter_key);
    END IF;
END $$;
