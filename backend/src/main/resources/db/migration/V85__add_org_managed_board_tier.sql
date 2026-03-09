ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_tier_check;
ALTER TABLE boards ADD CONSTRAINT boards_tier_check
    CHECK (tier IN ('TRIAL', 'STANDARD', 'PREMIUM', 'ORG_MANAGED'));
