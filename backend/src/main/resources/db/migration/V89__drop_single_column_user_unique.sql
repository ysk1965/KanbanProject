-- =============================================
-- V89: Drop single-column UNIQUE on organization_members.user_id
-- =============================================
-- V79/V88에서 추가한 uq_organization_members_user_id UNIQUE(user_id) 제거.
--
-- 이유:
--   1. Organizations 소프트 딜리트 시 organization_members 행은 남아있어
--      삭제된 조직의 멤버가 새 조직에 가입할 수 없는 버그 발생
--   2. JPA 엔티티는 UNIQUE(organization_id, user_id) 복합 제약만 선언
--   3. 앱 레벨에서 이미 ALREADY_IN_ORGANIZATION 체크 구현 완료
--
-- 복합 UNIQUE(organization_id, user_id)는 V60에서 생성되어 유지됨.
-- =============================================

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS uq_organization_members_user_id;
