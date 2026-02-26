-- Organization performance indexes

-- organization_members: 조직+유저 조합 조회 최적화
CREATE INDEX IF NOT EXISTS idx_orgmember_org_user
ON organization_members(organization_id, user_id);

-- organization_members: 유저별 소속 조직 조회 최적화
CREATE INDEX IF NOT EXISTS idx_orgmember_user
ON organization_members(user_id);

-- organizations: 오너별 조회 + soft delete 필터
CREATE INDEX IF NOT EXISTS idx_org_owner_deleted
ON organizations(owner_id, deleted_at);

-- boards: 조직별 보드 조회 + soft delete 필터
CREATE INDEX IF NOT EXISTS idx_board_org_deleted
ON boards(organization_id, deleted_at);

-- org_activities: 커서 기반 페이지네이션 최적화
CREATE INDEX IF NOT EXISTS idx_orgactivity_org_created
ON org_activities(organization_id, created_at DESC);
