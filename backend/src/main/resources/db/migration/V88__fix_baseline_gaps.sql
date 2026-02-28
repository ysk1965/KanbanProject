-- =============================================
-- V87: Fix baseline gaps from pre-Flyway era
-- Flyway가 미동작이던 시기에 JPA ddl-auto: update로 적용 불가했던
-- 스키마 변경(컬럼 이름 변경, CHECK 제약조건, 부분 인덱스, 데이터 정리)을 보정합니다.
-- 모든 구문은 IF NOT EXISTS / IF EXISTS로 멱등(idempotent) 처리됩니다.
-- =============================================


-- =============================================
-- SECTION 1: CRITICAL — 컬럼 이름 변경 (V62)
-- =============================================

-- V62 미적용 보정: leave_balances.year → leave_year
-- JPA ddl-auto: update는 컬럼 이름 변경이 불가
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leave_balances' AND column_name = 'year'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leave_balances' AND column_name = 'leave_year'
    ) THEN
        ALTER TABLE leave_balances RENAME COLUMN "year" TO leave_year;

        -- 인덱스도 재생성 (이전 컬럼명 기반 인덱스가 있을 수 있음)
        DROP INDEX IF EXISTS idx_leavebal_org_year;
        CREATE INDEX idx_leavebal_org_year ON leave_balances(organization_id, leave_year);

        -- Unique 제약조건 재생성
        ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS uq_leave_balance;
        ALTER TABLE leave_balances
            ADD CONSTRAINT uq_leave_balance UNIQUE (member_id, policy_id, leave_year);

        RAISE NOTICE 'Renamed leave_balances.year → leave_year (with index & unique constraint)';
    END IF;
END $$;


-- =============================================
-- SECTION 2: CRITICAL — 1인 1조직 제약 (V79)
-- =============================================

-- V79: 중복 조직 멤버십 정리 + UNIQUE 제약조건
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'organization_members'::regclass
          AND conname = 'uq_organization_members_user_id'
    ) THEN
        -- 중복 멤버십 정리 (가장 최근 것만 유지)
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

        ALTER TABLE organization_members
            ADD CONSTRAINT uq_organization_members_user_id UNIQUE (user_id);
        RAISE NOTICE 'Applied single-org-per-user constraint';
    END IF;
END $$;


-- =============================================
-- SECTION 3: CRITICAL — boards.tier CHECK (V85)
-- =============================================

-- V85: ORG_MANAGED tier 지원
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'boards'::regclass AND contype = 'c' AND conname = 'boards_tier_check'
    ) THEN
        ALTER TABLE boards DROP CONSTRAINT boards_tier_check;
    END IF;

    -- 제약조건이 없거나 방금 삭제했으면 새로 생성
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'boards'::regclass AND contype = 'c' AND conname = 'boards_tier_check'
    ) THEN
        ALTER TABLE boards ADD CONSTRAINT boards_tier_check
            CHECK (tier IN ('TRIAL', 'STANDARD', 'PREMIUM', 'ORG_MANAGED'));
    END IF;
END $$;


-- =============================================
-- SECTION 4: HIGH — CHECK 제약조건 (V60, V61, V70, V72, V86)
-- JPA ddl-auto는 CHECK 제약조건을 생성하지 않음
-- =============================================

-- V60: organization_members 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_members'::regclass AND conname = 'chk_org_role') THEN
        ALTER TABLE organization_members ADD CONSTRAINT chk_org_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_members'::regclass AND conname = 'chk_contract_type') THEN
        ALTER TABLE organization_members ADD CONSTRAINT chk_contract_type CHECK (contract_type IN ('FULL_TIME', 'CONTRACT', 'INTERN', 'PART_TIME'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_members'::regclass AND conname = 'chk_work_status') THEN
        ALTER TABLE organization_members ADD CONSTRAINT chk_work_status CHECK (work_status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED'));
    END IF;
END $$;

-- V60: boards 조직-보드타입 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'boards'::regclass AND conname = 'chk_org_board_type') THEN
        ALTER TABLE boards ADD CONSTRAINT chk_org_board_type CHECK (organization_id IS NULL OR board_type = 'TEAM');
    END IF;
END $$;

-- V60: organization_invite_links 역할 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_invite_links'::regclass AND conname = 'chk_invite_role') THEN
        ALTER TABLE organization_invite_links ADD CONSTRAINT chk_invite_role CHECK (role IN ('ADMIN', 'MEMBER'));
    END IF;
END $$;

-- V61: leave_policies 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_policies'::regclass AND conname = 'chk_leave_category') THEN
        ALTER TABLE leave_policies ADD CONSTRAINT chk_leave_category CHECK (leave_category IN ('ANNUAL', 'SICK', 'REFRESH', 'OTHER'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_policies'::regclass AND conname = 'chk_default_days_positive') THEN
        ALTER TABLE leave_policies ADD CONSTRAINT chk_default_days_positive CHECK (default_days >= 0);
    END IF;
END $$;

-- V61: leave_balances 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_balances'::regclass AND conname = 'chk_total_days_positive') THEN
        ALTER TABLE leave_balances ADD CONSTRAINT chk_total_days_positive CHECK (total_days >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_balances'::regclass AND conname = 'chk_used_days_positive') THEN
        ALTER TABLE leave_balances ADD CONSTRAINT chk_used_days_positive CHECK (used_days >= 0);
    END IF;
END $$;

-- V61: leave_requests 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_requests'::regclass AND conname = 'chk_duration_type') THEN
        ALTER TABLE leave_requests ADD CONSTRAINT chk_duration_type CHECK (duration_type IN ('FULL_DAY', 'AM_HALF', 'PM_HALF'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_requests'::regclass AND conname = 'chk_leave_status') THEN
        ALTER TABLE leave_requests ADD CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_requests'::regclass AND conname = 'chk_date_range') THEN
        ALTER TABLE leave_requests ADD CONSTRAINT chk_date_range CHECK (end_date >= start_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_requests'::regclass AND conname = 'chk_half_day_single_date') THEN
        ALTER TABLE leave_requests ADD CONSTRAINT chk_half_day_single_date CHECK (duration_type = 'FULL_DAY' OR start_date = end_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_requests'::regclass AND conname = 'chk_total_days_gt_zero') THEN
        ALTER TABLE leave_requests ADD CONSTRAINT chk_total_days_gt_zero CHECK (total_days > 0);
    END IF;
END $$;

-- V70: org_one_on_ones 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'org_one_on_ones'::regclass AND conname = 'chk_different_members') THEN
        ALTER TABLE org_one_on_ones ADD CONSTRAINT chk_different_members CHECK (member_a_id != member_b_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'org_one_on_ones'::regclass AND conname = 'chk_member_order') THEN
        ALTER TABLE org_one_on_ones ADD CONSTRAINT chk_member_order CHECK (member_a_id < member_b_id);
    END IF;
END $$;

-- V86: leave_balance_adjustments 제약조건
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'leave_balance_adjustments'::regclass AND conname = 'chk_adjustment_type') THEN
        ALTER TABLE leave_balance_adjustments ADD CONSTRAINT chk_adjustment_type CHECK (adjustment_type IN ('GRANT', 'REVOKE', 'MANUAL_ADJUST', 'ANNUAL_INIT'));
    END IF;
END $$;


-- =============================================
-- SECTION 5: HIGH — UNIQUE 제약조건 (V72)
-- JPA @UniqueConstraint 누락 가능성
-- =============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'org_attendance_records'::regclass AND conname = 'uq_attendance_record') THEN
        ALTER TABLE org_attendance_records ADD CONSTRAINT uq_attendance_record UNIQUE (organization_id, member_id, record_date);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'org_custom_holidays'::regclass AND conname = 'uq_custom_holiday') THEN
        ALTER TABLE org_custom_holidays ADD CONSTRAINT uq_custom_holiday UNIQUE (organization_id, holiday_date);
    END IF;
END $$;


-- =============================================
-- SECTION 6: MEDIUM — 부분 인덱스 (Partial Indexes)
-- JPA @Index는 WHERE 절을 지원하지 않음
-- =============================================

-- V60: 활성 조직 인덱스
CREATE INDEX IF NOT EXISTS idx_org_active ON organizations(id) WHERE deleted_at IS NULL;

-- V71: 미완료 1:1 액션 아이템 인덱스
CREATE INDEX IF NOT EXISTS idx_one_on_one_actions_open ON org_one_on_one_action_items(assignee_id) WHERE is_completed = false;

-- V73: 1:1 미팅 소프트딜리트 인덱스
CREATE INDEX IF NOT EXISTS idx_one_on_one_meetings_active ON org_one_on_one_meetings(one_on_one_id) WHERE deleted_at IS NULL;

-- V73: 1:1 다음 미팅일 인덱스
CREATE INDEX IF NOT EXISTS idx_one_on_one_next_meeting ON org_one_on_ones(organization_id, next_meeting_date) WHERE deleted_at IS NULL AND is_active = true;

-- V76: manager_id 단일 컬럼 인덱스 (V73이 복합 인덱스로 같은 이름 점유)
CREATE INDEX IF NOT EXISTS idx_orgmember_manager_only ON organization_members(manager_id);


-- =============================================
-- SECTION 7: MEDIUM — 기타 인덱스 & 제약조건
-- =============================================

-- V65: 축하 메시지 중복 방지 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS uq_celebration_author
    ON org_celebration_messages(target_member_id, author_id, anniversary_type, anniversary_date);

-- V61: leave_requests 복합 인덱스 (성능)
CREATE INDEX IF NOT EXISTS idx_leavereq_org_status_date ON leave_requests(organization_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_leavereq_reviewer ON leave_requests(reviewer_id);


-- =============================================
-- SECTION 8: LOW — DEFAULT 값 UTC 보정 (V73)
-- =============================================

ALTER TABLE org_announcements ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');
ALTER TABLE org_announcements ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');
ALTER TABLE org_activities ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC');


-- =============================================
-- SECTION 9: DATA — V83 기존 조직 FREE 구독 자동 생성
-- =============================================

INSERT INTO org_subscriptions (id, organization_id, plan, status, board_limit, created_at, updated_at)
SELECT gen_random_uuid()::VARCHAR, o.id, 'FREE', 'ACTIVE', 0,
       NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
FROM organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM org_subscriptions os WHERE os.organization_id = o.id);
