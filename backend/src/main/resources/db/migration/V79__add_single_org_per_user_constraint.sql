-- 1인 1조직 정책: 한 유저는 하나의 조직에만 소속 가능
-- 기존 다중 조직 멤버십이 있으면 가장 최근 것만 유지
DELETE FROM organization_members om1
WHERE om1.id NOT IN (
    SELECT om2.id FROM (
        SELECT DISTINCT ON (user_id) id
        FROM organization_members
        ORDER BY user_id, joined_at DESC NULLS LAST, id DESC
    ) om2
)
AND om1.user_id IN (
    SELECT user_id FROM organization_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
);

-- user_id에 UNIQUE 제약조건 추가
ALTER TABLE organization_members ADD CONSTRAINT uq_organization_members_user_id UNIQUE (user_id);
