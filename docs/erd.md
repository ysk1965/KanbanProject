erDiagram
    %% ==================
    %% 회원 & 인증
    %% ==================
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar name
        varchar profile_image
        varchar auth_provider
        varchar auth_provider_id
        timestamp created_at
        timestamp last_login_at
    }

    %% ==================
    %% 보드
    %% ==================
    boards {
        uuid id PK
        varchar name
        text description
        uuid owner_id FK
        timestamp created_at
        timestamp updated_at
    }

    %% ==================
    %% 구독 & 결제
    %% ==================
    subscriptions {
        uuid id PK
        uuid board_id FK,UK
        varchar status
        varchar plan
        varchar billing_cycle
        integer price
        timestamp trial_ends_at
        timestamp grace_ends_at
        timestamp current_period_start
        timestamp current_period_end
        integer billable_member_count
        varchar payment_method_id
        timestamp next_payment_at
    }

    payment_history {
        uuid id PK
        uuid subscription_id FK
        integer amount
        varchar billing_cycle
        varchar status
        varchar pg_provider
        varchar pg_transaction_id
        timestamp period_start
        timestamp period_end
        integer member_count
        timestamp paid_at
    }

    pricing_plans {
        varchar id PK
        varchar name
        integer min_members
        integer max_members
        integer monthly_price
        integer yearly_price
        boolean is_active
    }

    %% ==================
    %% 멤버 & 초대
    %% ==================
    board_members {
        uuid id PK
        uuid board_id FK
        uuid user_id FK
        varchar role
        timestamp joined_at
        uuid invited_by FK
    }

    invite_links {
        uuid id PK
        uuid board_id FK
        varchar code UK
        varchar role
        integer max_uses
        integer used_count
        timestamp expires_at
        boolean is_active
        uuid created_by FK
    }

    %% ==================
    %% 블록 & 카드
    %% ==================
    blocks {
        uuid id PK
        uuid board_id FK
        varchar name
        varchar type
        varchar fixed_type
        varchar color
        integer position
    }

    features {
        uuid id PK
        uuid board_id FK
        varchar title
        text description
        uuid assignee_id FK
        varchar priority
        date due_date
        varchar status
        integer total_tasks
        integer completed_tasks
        integer position
        uuid created_by FK
        timestamp completed_at
    }

    tasks {
        uuid id PK
        uuid feature_id FK
        uuid board_id FK
        uuid block_id FK
        varchar title
        text description
        uuid assignee_id FK
        integer estimated_minutes
        boolean is_completed
        integer position
        uuid created_by FK
        timestamp completed_at
    }

    %% ==================
    %% 태그
    %% ==================
    tags {
        uuid id PK
        uuid board_id FK
        varchar name
        varchar color
        timestamp created_at
    }

    feature_tags {
        uuid id PK
        uuid feature_id FK
        uuid tag_id FK
    }

    task_tags {
        uuid id PK
        uuid task_id FK
        uuid tag_id FK
    }

    %% ==================
    %% 체크리스트
    %% ==================
    checklist_items {
        uuid id PK
        uuid task_id FK
        varchar title
        boolean is_completed
        uuid assignee_id FK
        date due_date
        integer position
        timestamp created_at
        timestamp completed_at
    }

    %% ==================
    %% 보드 즐겨찾기
    %% ==================
    user_board_stars {
        uuid id PK
        uuid user_id FK
        uuid board_id FK
        timestamp created_at
    }

    %% ==================
    %% 활동 로그
    %% ==================
    activity_log {
        uuid id PK
        uuid board_id FK
        uuid user_id FK
        varchar action
        varchar target_type
        uuid target_id
        jsonb metadata
        timestamp created_at
    }

    %% ==================
    %% 관계 정의
    %% ==================
    
    %% 보드 소유
    users ||--o{ boards : "owns"
    
    %% 구독
    boards ||--|| subscriptions : "has"
    subscriptions ||--o{ payment_history : "has"
    subscriptions }o--|| pricing_plans : "uses"
    
    %% 멤버십
    boards ||--o{ board_members : "has"
    users ||--o{ board_members : "joins"
    users ||--o{ board_members : "invites"
    
    %% 초대
    boards ||--o{ invite_links : "has"
    users ||--o{ invite_links : "creates"
    
    %% 블록
    boards ||--o{ blocks : "contains"
    
    %% Feature
    boards ||--o{ features : "contains"
    users ||--o{ features : "assigned"
    users ||--o{ features : "creates"
    
    %% Task
    features ||--o{ tasks : "has"
    boards ||--o{ tasks : "contains"
    blocks ||--o{ tasks : "holds"
    users ||--o{ tasks : "assigned"
    users ||--o{ tasks : "creates"
    
    %% 활동 로그
    boards ||--o{ activity_log : "logs"
    users ||--o{ activity_log : "performs"

    %% 태그
    boards ||--o{ tags : "has"
    features ||--o{ feature_tags : "has"
    tags ||--o{ feature_tags : "tagged"
    tasks ||--o{ task_tags : "has"
    tags ||--o{ task_tags : "tagged"

    %% 체크리스트
    tasks ||--o{ checklist_items : "has"
    users ||--o{ checklist_items : "assigned"

    %% 즐겨찾기
    users ||--o{ user_board_stars : "stars"
    boards ||--o{ user_board_stars : "starred_by"