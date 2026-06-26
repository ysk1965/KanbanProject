-- 마일스톤-피처: 대표(홈) + 이어가기 모델
-- 피처는 대표(primary) 마일스톤 1개에 소속, 예외적으로 다른 마일스톤에 "이어짐"으로 추가 표시 가능.
-- 진행률은 대표 마일스톤에만 집계되므로 is_primary 플래그를 추가한다.

-- 1) is_primary 컬럼 추가 (멱등)
DO $$ BEGIN
    ALTER TABLE milestone_features ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) 백필: 기존 다중 링크 피처는 마일스톤 start_date가 가장 빠른 링크를 대표로 유지하고
--    나머지를 이어짐(false)으로 강등. tiebreak: 동일 start_date면 mf.id 사전순.
--    (기본값이 TRUE이므로 강등 UPDATE만 수행)
UPDATE milestone_features mf
SET is_primary = false
WHERE EXISTS (
    SELECT 1
    FROM milestone_features o
    JOIN milestones om ON om.id = o.milestone_id
    JOIN milestones mm ON mm.id = mf.milestone_id
    WHERE o.feature_id = mf.feature_id
      AND o.id <> mf.id
      AND (
          om.start_date < mm.start_date
          OR (om.start_date = mm.start_date AND o.id < mf.id)
      )
);

-- 3) 불변식 강제: 피처당 대표 링크는 최대 1개 (부분 유니크 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS uq_milestone_feature_primary
    ON milestone_features (feature_id)
    WHERE is_primary = true;
