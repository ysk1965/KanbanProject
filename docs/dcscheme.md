-- =============================================
-- 팀 칸반보드 Database Schema
-- =============================================

-- ---------------------------------------------
-- 1. USERS (회원)
-- ---------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),                    -- 소셜 로그인 시 NULL
    name            VARCHAR(100) NOT NULL,
    profile_image   VARCHAR(500),
    auth_provider   VARCHAR(20) DEFAULT 'email',     -- email, google, github
    auth_provider_id VARCHAR(255),                   -- 소셜 로그인 ID
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- ---------------------------------------------
-- 2. BOARDS (보드)
-- ---------------------------------------------
CREATE TABLE boards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_boards_owner ON boards(owner_id);

-- ---------------------------------------------
-- 3. SUBSCRIPTIONS (구독)
-- ---------------------------------------------
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id            UUID UNIQUE NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    
    -- 상태: trial, grace, active, suspended, cancelled
    status              VARCHAR(20) NOT NULL DEFAULT 'trial',
    
    -- 플랜: free, team_10, team_25, team_50, enterprise
    plan                VARCHAR(20) NOT NULL DEFAULT 'free',
    
    -- 결제 주기: monthly, yearly
    billing_cycle       VARCHAR(10) DEFAULT 'monthly',
    
    -- 금액 (원)
    price               INTEGER DEFAULT 0,
    
    -- 기간
    trial_ends_at       TIMESTAMP,                   -- 체험 종료일
    grace_ends_at       TIMESTAMP,                   -- 유예 종료일
    current_period_start TIMESTAMP,                  -- 현재 구독 시작일
    current_period_end  TIMESTAMP,                   -- 현재 구독 종료일
    
    -- 구성원 수 (과금 기준)
    billable_member_count INTEGER DEFAULT 1,
    
    -- 결제 정보
    payment_method_id   VARCHAR(255),                -- PG사 결제 수단 ID
    last_payment_at     TIMESTAMP,
    next_payment_at     TIMESTAMP,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_at);

-- ---------------------------------------------
-- 4. PAYMENT_HISTORY (결제 내역)
-- ---------------------------------------------
CREATE TABLE payment_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    
    -- 결제 정보
    amount          INTEGER NOT NULL,                -- 결제 금액 (원)
    currency        VARCHAR(3) DEFAULT 'KRW',
    billing_cycle   VARCHAR(10) NOT NULL,            -- monthly, yearly
    
    -- 상태: pending, completed, failed, refunded
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- PG사 정보
    pg_provider     VARCHAR(50),                     -- toss, inicis 등
    pg_transaction_id VARCHAR(255),
    
    -- 기간
    period_start    TIMESTAMP NOT NULL,
    period_end      TIMESTAMP NOT NULL,
    
    -- 메타
    member_count    INTEGER,                         -- 결제 시점 구성원 수
    plan            VARCHAR(20),                     -- 결제 시점 플랜
    
    paid_at         TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_history_subscription ON payment_history(subscription_id);

-- ---------------------------------------------
-- 5. BOARD_MEMBERS (보드 멤버)
-- ---------------------------------------------
CREATE TABLE board_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 역할: owner, admin, member, viewer
    role        VARCHAR(20) NOT NULL DEFAULT 'member',
    
    joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invited_by  UUID REFERENCES users(id),
    
    UNIQUE(board_id, user_id)
);

CREATE INDEX idx_board_members_board ON board_members(board_id);
CREATE INDEX idx_board_members_user ON board_members(user_id);

-- ---------------------------------------------
-- 6. INVITE_LINKS (초대 링크)
-- ---------------------------------------------
CREATE TABLE invite_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    
    code        VARCHAR(50) UNIQUE NOT NULL,         -- 초대 코드
    role        VARCHAR(20) NOT NULL DEFAULT 'member', -- 부여할 역할
    
    max_uses    INTEGER,                             -- NULL = 무제한
    used_count  INTEGER DEFAULT 0,
    
    expires_at  TIMESTAMP,                           -- NULL = 무제한
    is_active   BOOLEAN DEFAULT TRUE,
    
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invite_links_code ON invite_links(code);
CREATE INDEX idx_invite_links_board ON invite_links(board_id);

-- ---------------------------------------------
-- 7. BLOCKS (블록/컬럼)
-- ---------------------------------------------
CREATE TABLE blocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    
    name        VARCHAR(100) NOT NULL,
    
    -- 타입: fixed (Feature, Task, Done), custom
    type        VARCHAR(20) NOT NULL DEFAULT 'custom',
    
    -- 고정 블록 식별: feature, task, done, NULL(커스텀)
    fixed_type  VARCHAR(20),
    
    color       VARCHAR(7),                          -- HEX 색상 (#3B82F6)
    position    INTEGER NOT NULL,                    -- 정렬 순서
    
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blocks_board ON blocks(board_id);

-- ---------------------------------------------
-- 8. FEATURES (피쳐 카드)
-- ---------------------------------------------
CREATE TABLE features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    
    -- 담당자
    assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- 우선순위: low, medium, high
    priority        VARCHAR(10) DEFAULT 'medium',
    
    -- 마감일
    due_date        DATE,
    
    -- 상태: active, completed
    status          VARCHAR(20) DEFAULT 'active',
    
    -- 진행률 (캐싱)
    total_tasks     INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    
    -- 정렬
    position        INTEGER NOT NULL,
    
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP
);

CREATE INDEX idx_features_board ON features(board_id);
CREATE INDEX idx_features_assignee ON features(assignee_id);

-- ---------------------------------------------
-- 9. TASKS (태스크 카드)
-- ---------------------------------------------
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id      UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    
    -- 현재 위치 블록
    block_id        UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    
    -- 담당자
    assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- 예상 소요시간 (분)
    estimated_minutes INTEGER,
    
    -- 완료 여부
    is_completed    BOOLEAN DEFAULT FALSE,
    
    -- 정렬 (블록 내 순서)
    position        INTEGER NOT NULL,
    
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP
);

CREATE INDEX idx_tasks_feature ON tasks(feature_id);
CREATE INDEX idx_tasks_block ON tasks(block_id);
CREATE INDEX idx_tasks_board ON tasks(board_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- ---------------------------------------------
-- 10. ACTIVITY_LOG (활동 로그)
-- ---------------------------------------------
CREATE TABLE activity_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- 액션 타입
    action      VARCHAR(50) NOT NULL,                -- card_created, card_moved, member_invited 등
    
    -- 대상
    target_type VARCHAR(20),                         -- feature, task, block, member
    target_id   UUID,
    
    -- 상세 데이터 (JSON)
    metadata    JSONB,
    
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_board ON activity_log(board_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);

-- ---------------------------------------------
-- 11. PRICING_PLANS (요금제 정보)
-- ---------------------------------------------
CREATE TABLE pricing_plans (
    id              VARCHAR(20) PRIMARY KEY,         -- free, team_10, team_25, team_50
    name            VARCHAR(50) NOT NULL,
    
    min_members     INTEGER NOT NULL,
    max_members     INTEGER,                         -- NULL = 무제한
    
    monthly_price   INTEGER NOT NULL,                -- 월 요금 (원)
    yearly_price    INTEGER NOT NULL,                -- 연 요금 (원)
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 기본 요금제 데이터
INSERT INTO pricing_plans (id, name, min_members, max_members, monthly_price, yearly_price) VALUES
('free', '무료', 1, 3, 0, 0),
('team_10', '팀 10', 4, 10, 29000, 290000),
('team_25', '팀 25', 11, 25, 69000, 660000),
('team_50', '팀 50', 26, 50, 129000, 1190000),
('enterprise', '엔터프라이즈', 51, NULL, 0, 0);  -- 별도 협의


-- =============================================
-- VIEWS (조회용 뷰)
-- =============================================

-- 보드별 과금 대상 멤버 수
CREATE VIEW v_board_billable_members AS
SELECT 
    board_id,
    COUNT(*) as billable_count
FROM board_members
WHERE role IN ('owner', 'admin', 'member')
GROUP BY board_id;

-- 보드 전체 정보 (구독 포함)
CREATE VIEW v_board_details AS
SELECT 
    b.*,
    s.status as subscription_status,
    s.plan as subscription_plan,
    s.billing_cycle,
    s.price,
    s.trial_ends_at,
    s.current_period_end,
    COALESCE(v.billable_count, 1) as billable_member_count
FROM boards b
LEFT JOIN subscriptions s ON b.id = s.board_id
LEFT JOIN v_board_billable_members v ON b.id = v.board_id;


-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Feature 진행률 자동 업데이트
CREATE OR REPLACE FUNCTION update_feature_progress()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE features
    SET 
        total_tasks = (SELECT COUNT(*) FROM tasks WHERE feature_id = COALESCE(NEW.feature_id, OLD.feature_id)),
        completed_tasks = (SELECT COUNT(*) FROM tasks WHERE feature_id = COALESCE(NEW.feature_id, OLD.feature_id) AND is_completed = TRUE),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.feature_id, OLD.feature_id);
    
    -- 모든 태스크 완료 시 Feature도 완료
    UPDATE features
    SET 
        status = CASE 
            WHEN total_tasks > 0 AND total_tasks = completed_tasks THEN 'completed'
            ELSE 'active'
        END,
        completed_at = CASE 
            WHEN total_tasks > 0 AND total_tasks = completed_tasks THEN CURRENT_TIMESTAMP
            ELSE NULL
        END
    WHERE id = COALESCE(NEW.feature_id, OLD.feature_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_feature_progress
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_feature_progress();

-- 구독 멤버 수 자동 업데이트
CREATE OR REPLACE FUNCTION update_subscription_member_count()
RETURNS TRIGGER AS $$
DECLARE
    v_board_id UUID;
    v_count INTEGER;
BEGIN
    v_board_id := COALESCE(NEW.board_id, OLD.board_id);
    
    SELECT COUNT(*) INTO v_count
    FROM board_members
    WHERE board_id = v_board_id AND role IN ('owner', 'admin', 'member');
    
    UPDATE subscriptions
    SET 
        billable_member_count = v_count,
        updated_at = CURRENT_TIMESTAMP
    WHERE board_id = v_board_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subscription_member_count
AFTER INSERT OR UPDATE OR DELETE ON board_members
FOR EACH ROW EXECUTE FUNCTION update_subscription_member_count();

-- 보드 생성 시 기본 블록 + 구독 자동 생성
CREATE OR REPLACE FUNCTION initialize_board()
RETURNS TRIGGER AS $$
BEGIN
    -- 고정 블록 생성
    INSERT INTO blocks (board_id, name, type, fixed_type, position) VALUES
    (NEW.id, 'Feature', 'fixed', 'feature', 0),
    (NEW.id, 'Task', 'fixed', 'task', 1),
    (NEW.id, 'Done', 'fixed', 'done', 9999);
    
    -- Owner를 멤버로 추가
    INSERT INTO board_members (board_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    
    -- Trial 구독 생성
    INSERT INTO subscriptions (board_id, status, plan, trial_ends_at, billable_member_count)
    VALUES (NEW.id, 'trial', 'free', CURRENT_TIMESTAMP + INTERVAL '7 days', 1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_initialize_board
AFTER INSERT ON boards
FOR EACH ROW EXECUTE FUNCTION initialize_board();

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_boards_updated_at BEFORE UPDATE ON boards FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_features_updated_at BEFORE UPDATE ON features FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_blocks_updated_at BEFORE UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trigger_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_timestamp();