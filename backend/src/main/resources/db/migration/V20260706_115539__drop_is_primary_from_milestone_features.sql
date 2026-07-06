-- 마일스톤-피처 "대표(홈)" 플래그 제거.
-- 홈 마일스톤은 저장하지 않고, 피처가 연결된 마일스톤 중 가장 이른 시작일(동률 시 마일스톤 id)로 파생한다.
-- 원래 도입 목적(진행률을 대표 마일스톤에만 집계)은 태스크 단위 진행률 전환(V20260630)으로 이미 폐기됨.

-- 1) 부분 유니크 인덱스 제거 (멱등)
DROP INDEX IF EXISTS uq_milestone_feature_primary;

-- 2) is_primary 컬럼 제거 (멱등)
DO $$ BEGIN
    ALTER TABLE milestone_features DROP COLUMN is_primary;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
