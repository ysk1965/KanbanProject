-- 스프린트 담기 단위를 태스크 → 피쳐로 개편.
-- sprint_features = "이 스프린트에 이 피쳐가 담겨 있다"는 매핑. 태스크의 sprint_id는
-- 컬럼 이동/게이지용으로 유지되고, 담기/빼기의 진입점만 피쳐 단위가 된다.
-- 태스크가 0개인 피쳐도 매핑만으로 스프린트 보드에 (맨 뒤) 표시된다.

-- 테이블 생성 (멱등)
CREATE TABLE IF NOT EXISTS sprint_features (
    id VARCHAR(36) PRIMARY KEY,
    sprint_id VARCHAR(36) NOT NULL,
    feature_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP
);

-- 인덱스 (멱등)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sprint_features_sprint_feature
    ON sprint_features(sprint_id, feature_id);
CREATE INDEX IF NOT EXISTS idx_sprint_features_feature
    ON sprint_features(feature_id);

-- FK (멱등)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sprint_features_sprint') THEN
        ALTER TABLE sprint_features
            ADD CONSTRAINT fk_sprint_features_sprint
            FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sprint_features_feature') THEN
        ALTER TABLE sprint_features
            ADD CONSTRAINT fk_sprint_features_feature
            FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 기존 데이터 승격: 태스크가 하나라도 담긴 (스프린트, 피쳐) 쌍을 피쳐 담김으로 백필 (멱등)
INSERT INTO sprint_features (id, sprint_id, feature_id, created_at)
SELECT gen_random_uuid()::text, t.sprint_id, t.feature_id, now()
FROM tasks t
WHERE t.sprint_id IS NOT NULL AND t.feature_id IS NOT NULL
GROUP BY t.sprint_id, t.feature_id
ON CONFLICT (sprint_id, feature_id) DO NOTHING;
