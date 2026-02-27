-- 1. OrgSubscription 테이블
CREATE TABLE org_subscriptions (
    id              VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    plan            VARCHAR(20) NOT NULL DEFAULT 'FREE',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    billing_cycle   VARCHAR(10),
    seat_count          INT NOT NULL DEFAULT 0,
    active_member_count INT NOT NULL DEFAULT 0,
    price_per_seat      INT NOT NULL DEFAULT 0,
    total_price         INT NOT NULL DEFAULT 0,
    current_period_start TIMESTAMP,
    current_period_end   TIMESTAMP,
    next_payment_at      TIMESTAMP,
    payment_method_id    VARCHAR(100),
    trial_ends_at TIMESTAMP,
    board_limit INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at  TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    canceled_at TIMESTAMP
);

CREATE INDEX idx_org_sub_org_id ON org_subscriptions(organization_id);
CREATE INDEX idx_org_sub_status ON org_subscriptions(status);
CREATE INDEX idx_org_sub_next_payment ON org_subscriptions(next_payment_at);

-- 2. OrgPaymentHistory 테이블
CREATE TABLE org_payment_history (
    id                  VARCHAR(36) PRIMARY KEY,
    org_subscription_id VARCHAR(36) NOT NULL REFERENCES org_subscriptions(id),
    amount          INT NOT NULL,
    credit_applied  INT NOT NULL DEFAULT 0,
    billing_cycle   VARCHAR(10),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_type    VARCHAR(20) NOT NULL,
    pg_provider       VARCHAR(50),
    pg_transaction_id VARCHAR(100),
    period_start TIMESTAMP NOT NULL,
    period_end   TIMESTAMP NOT NULL,
    member_count INT NOT NULL,
    paid_at    TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_org_pay_sub_id ON org_payment_history(org_subscription_id);
CREATE INDEX idx_org_pay_status ON org_payment_history(status);

-- 3. 기존 Organization에 FREE 구독 자동 생성
INSERT INTO org_subscriptions (id, organization_id, plan, status, board_limit, created_at, updated_at)
SELECT gen_random_uuid()::VARCHAR, o.id, 'FREE', 'ACTIVE', 0, NOW(), NOW()
FROM organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM org_subscriptions os WHERE os.organization_id = o.id);
