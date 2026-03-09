package com.kanban.global.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.List;

/**
 * JPA EntityManagerFactory 초기화 전에 실행되는 스키마 마이그레이션.
 * prod 환경(ddl-auto: validate)에서 새 컬럼 추가 시 앱 시작 실패를 방지.
 *
 * Spring Boot의 EntityManagerFactoryDependsOnPostProcessor를 통해
 * JPA 검증/업데이트 전에 반드시 실행됨 (Flyway와 동일한 메커니즘).
 *
 * @see SchemaMigrationConfig
 */
@Slf4j
public class SchemaMigrationInitializer implements InitializingBean {

    private final JdbcTemplate jdbcTemplate;
    private final String cloudfrontDomain;
    private final String s3Bucket;

    public SchemaMigrationInitializer(DataSource dataSource) {
        this(dataSource, null, null);
    }

    public SchemaMigrationInitializer(DataSource dataSource, String cloudfrontDomain, String s3Bucket) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
        this.cloudfrontDomain = cloudfrontDomain;
        this.s3Bucket = s3Bucket;
    }

    @Override
    public void afterPropertiesSet() {
        String dbProductName = detectDatabaseProduct();
        if ("H2".equalsIgnoreCase(dbProductName)) {
            log.info("Schema migration: H2 detected, skipping (ddl-auto handles it)");
            return;
        }

        log.info("Schema migration: running pre-JPA schema patches for {}", dbProductName);

        // ── Users 테이블 (V10, V44, V48, V53) ──
        addColumnIfNotExists("users", "last_active_at", "TIMESTAMP");
        addColumnIfNotExists("users", "personal_ai_credits", "INTEGER DEFAULT 30");
        addColumnIfNotExists("users", "personal_credits_used", "INTEGER DEFAULT 0");
        addColumnIfNotExists("users", "personal_credits_reset_date", "TIMESTAMP");
        addColumnIfNotExists("users", "personal_space_enabled", "BOOLEAN NOT NULL DEFAULT false");
        addColumnIfNotExists("users", "personal_purchased_credits", "INTEGER DEFAULT 0");

        // ── Boards 테이블 (V40, V51, V52, V60, schedule/tier) ──
        addColumnIfNotExists("boards", "board_type", "VARCHAR(20) NOT NULL DEFAULT 'TEAM'");
        addColumnIfNotExists("boards", "background_gradient", "VARCHAR(255)");
        addColumnIfNotExists("boards", "deleted_at", "TIMESTAMP");
        addColumnIfNotExists("boards", "organization_id", "VARCHAR(36)");
        addColumnIfNotExists("boards", "work_hours_per_day", "INTEGER DEFAULT 10");
        addColumnIfNotExists("boards", "work_start_time", "TIME DEFAULT '09:00'");
        addColumnIfNotExists("boards", "schedule_display_mode", "VARCHAR(10) DEFAULT 'TIME'");
        addColumnIfNotExists("boards", "break_start_time", "TIME");
        addColumnIfNotExists("boards", "break_end_time", "TIME");
        addColumnIfNotExists("boards", "selected_milestone_id", "VARCHAR(36)");
        addColumnIfNotExists("boards", "tier", "VARCHAR(20) DEFAULT 'TRIAL'");
        addColumnIfNotExists("boards", "trial_ends_at", "TIMESTAMP");

        // ── Board Members 테이블 (V6, V28) ──
        addColumnIfNotExists("board_members", "assignee_color", "VARCHAR(20)");
        addColumnIfNotExists("board_members", "display_order", "INTEGER");

        // ── Organizations 테이블 (V78, V84) ──
        addColumnIfNotExists("organizations", "departments_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("organizations", "job_groups_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("organizations", "positions_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("organizations", "titles_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("organizations", "grades_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("organizations", "trial_used", "BOOLEAN DEFAULT FALSE");

        // ── Organization Members 테이블 (V65, V67, V74) ──
        addColumnIfNotExists("organization_members", "timezone", "VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul'");
        addColumnIfNotExists("organization_members", "manager_id", "VARCHAR(36)");
        addColumnIfNotExists("organization_members", "position_id", "VARCHAR(36)");
        addColumnIfNotExists("organization_members", "title_id", "VARCHAR(36)");
        addColumnIfNotExists("organization_members", "grade_id", "VARCHAR(36)");

        // ── Subscriptions 테이블 (V32, V84) ──
        addColumnIfNotExists("subscriptions", "monthly_ai_credits", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfNotExists("subscriptions", "monthly_credits_used", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfNotExists("subscriptions", "purchased_credits", "INTEGER NOT NULL DEFAULT 0");
        addColumnIfNotExists("subscriptions", "credits_reset_date", "TIMESTAMP");
        addColumnIfNotExists("subscriptions", "migrated_to_org", "BOOLEAN DEFAULT FALSE");
        addColumnIfNotExists("subscriptions", "migrated_to_org_id", "VARCHAR(36)");
        addColumnIfNotExists("subscriptions", "migrated_at", "TIMESTAMP");
        addColumnIfNotExists("subscriptions", "billing_paused_for_org", "BOOLEAN DEFAULT FALSE");

        // ── Meetings 테이블 (V22, V29, V38, V39, V58) ──
        addColumnIfNotExists("meetings", "transcript", "TEXT");
        addColumnIfNotExists("meetings", "recurrence_rule", "VARCHAR(20)");
        addColumnIfNotExists("meetings", "recurrence_group_id", "VARCHAR(36)");
        addColumnIfNotExists("meetings", "recurrence_end_date", "DATE");
        addColumnIfNotExists("meetings", "recurrence_days_of_week", "VARCHAR(20)");
        addColumnIfNotExists("meetings", "recurrence_week_of_month", "INTEGER");
        addColumnIfNotExists("meetings", "diarized_transcript", "TEXT");
        addColumnIfNotExists("meetings", "speaker_mapping", "TEXT");
        addColumnIfNotExists("meetings", "ai_suggestions", "TEXT");

        // ── Notes 테이블 (V34) ──
        addColumnIfNotExists("notes", "is_shared", "BOOLEAN NOT NULL DEFAULT FALSE");
        addColumnIfNotExists("notes", "share_token", "VARCHAR(36) UNIQUE");
        addColumnIfNotExists("notes", "ai_suggestions", "TEXT");
        addColumnIfNotExists("notes", "ai_content_snapshot", "TEXT");

        // ── Notifications 테이블 (V35) ──
        addColumnIfNotExists("notifications", "note_id", "VARCHAR(36)");

        // ── Notification Preferences 테이블 (V20, V35) ──
        addColumnIfNotExists("notification_preferences", "meeting_memo_shared_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "slack_meeting_memo_shared_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "note_comment_mention_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "slack_note_comment_mention_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");

        // ── Features 테이블 (V37) ──
        addColumnIfNotExists("features", "start_date", "DATE");

        // ── Tasks 테이블 (V21) ──
        addColumnIfNotExists("tasks", "baseline_start_date", "DATE");
        addColumnIfNotExists("tasks", "baseline_due_date", "DATE");

        // ── Personal Events 테이블 (V41, V54, V57) ──
        addColumnIfNotExists("personal_events", "event_type", "VARCHAR(20) DEFAULT 'SCHEDULE'");
        addColumnIfNotExists("personal_events", "end_date", "DATE");
        addColumnIfNotExists("personal_events", "recurrence_rule", "VARCHAR(20)");
        addColumnIfNotExists("personal_events", "recurrence_group_id", "VARCHAR(36)");
        addColumnIfNotExists("personal_events", "recurrence_end_date", "DATE");
        addColumnIfNotExists("personal_events", "recurrence_days_of_week", "VARCHAR(20)");
        fixPersonalEventsEventType();

        // ── Personal Habits 테이블 (V50) ──
        addColumnIfNotExists("personal_habits", "importance", "VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'");

        // ── Schedule Blocks 테이블 (V19, V59) ──
        addColumnIfNotExists("schedule_blocks", "meeting_id", "VARCHAR(36)");
        addColumnIfNotExists("schedule_blocks", "block_type", "VARCHAR(20)");
        addColumnIfNotExists("schedule_blocks", "title", "VARCHAR(100)");
        addColumnIfNotExists("schedule_blocks", "color", "VARCHAR(7)");

        // ── AI Usage Logs 테이블 (V32) ──
        addColumnIfNotExists("ai_usage_logs", "credit_source", "VARCHAR(20) DEFAULT 'MONTHLY'");
        addColumnIfNotExists("ai_usage_logs", "credits_used", "INTEGER DEFAULT 1");

        // ── Inquiries 테이블 (V13) ──
        addColumnIfNotExists("inquiries", "has_new_reply", "BOOLEAN NOT NULL DEFAULT FALSE");

        // ── Inquiry Replies 테이블 (V12) ──
        addColumnIfNotExists("inquiry_replies", "user_id", "VARCHAR(36)");
        addColumnIfNotExists("inquiry_replies", "reply_type", "VARCHAR(10) NOT NULL DEFAULT 'ADMIN'");

        // Organizations 테이블 (V94)
        addColumnIfNotExists("organizations", "hr_system_enabled", "BOOLEAN NOT NULL DEFAULT FALSE");

        // Notification Preferences 테이블 - Discord 컬럼
        addColumnIfNotExists("notification_preferences", "discord_comment_mention_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "discord_checklist_assigned_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "discord_task_comment_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "discord_meeting_memo_shared_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");
        addColumnIfNotExists("notification_preferences", "discord_note_comment_mention_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");

        // Notifications CHECK 제약조건
        fixNotificationTypeCheck();

        // S3 직접 URL → CloudFront URL 마이그레이션
        migrateS3UrlsToCloudFront();

        log.info("Schema migration: pre-JPA patches completed ({} tables covered)", 17);
    }

    private String detectDatabaseProduct() {
        try {
            return jdbcTemplate.execute(
                    (org.springframework.jdbc.core.ConnectionCallback<String>) conn ->
                            conn.getMetaData().getDatabaseProductName()
            );
        } catch (Exception e) {
            log.warn("Schema migration: could not detect database product - {}", e.getMessage());
            return "unknown";
        }
    }

    private void addColumnIfNotExists(String table, String column, String definition) {
        try {
            boolean exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?)",
                    Boolean.class, table, column
            ));
            if (!exists) {
                jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
                log.info("Schema migration: added column {}.{}", table, column);
            }
        } catch (Exception e) {
            log.warn("Schema migration: add column {}.{} - {}", table, column, e.getMessage());
        }
    }

    private void fixPersonalEventsEventType() {
        try {
            jdbcTemplate.execute("UPDATE personal_events SET event_type = 'SCHEDULE' WHERE event_type IS NULL");
            jdbcTemplate.execute("ALTER TABLE personal_events ALTER COLUMN event_type SET NOT NULL");
            jdbcTemplate.execute("ALTER TABLE personal_events ALTER COLUMN event_type SET DEFAULT 'SCHEDULE'");
        } catch (Exception e) {
            log.warn("Schema migration: personal_events.event_type constraint - {}", e.getMessage());
        }
    }

    private void migrateS3UrlsToCloudFront() {
        if (cloudfrontDomain == null || cloudfrontDomain.isEmpty() || s3Bucket == null || s3Bucket.isEmpty()) {
            log.info("Schema migration: CloudFront domain not configured, skipping S3 URL migration");
            return;
        }

        String s3Prefix = "https://" + s3Bucket + ".s3.ap-northeast-2.amazonaws.com/";
        String cfPrefix = "https://" + cloudfrontDomain + "/";

        try {
            // comment_attachments.url
            int urlCount = jdbcTemplate.update(
                    "UPDATE comment_attachments SET url = REPLACE(url, ?, ?) WHERE url LIKE ?",
                    s3Prefix, cfPrefix, s3Prefix + "%");

            // comment_attachments.thumbnail_url
            int thumbCount = jdbcTemplate.update(
                    "UPDATE comment_attachments SET thumbnail_url = REPLACE(thumbnail_url, ?, ?) WHERE thumbnail_url LIKE ?",
                    s3Prefix, cfPrefix, s3Prefix + "%");

            // board_custom_emojis.image_url
            int emojiCount = jdbcTemplate.update(
                    "UPDATE board_custom_emojis SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?",
                    s3Prefix, cfPrefix, s3Prefix + "%");

            // inquiry_attachments.url / thumbnail_url
            int inquiryUrlCount = jdbcTemplate.update(
                    "UPDATE inquiry_attachments SET url = REPLACE(url, ?, ?) WHERE url LIKE ?",
                    s3Prefix, cfPrefix, s3Prefix + "%");
            int inquiryThumbCount = jdbcTemplate.update(
                    "UPDATE inquiry_attachments SET thumbnail_url = REPLACE(thumbnail_url, ?, ?) WHERE thumbnail_url LIKE ?",
                    s3Prefix, cfPrefix, s3Prefix + "%");

            int total = urlCount + thumbCount + emojiCount + inquiryUrlCount + inquiryThumbCount;
            if (total > 0) {
                log.info("Schema migration: migrated {} S3 URLs to CloudFront (comments: {}/{}, emojis: {}, inquiries: {}/{})",
                        total, urlCount, thumbCount, emojiCount, inquiryUrlCount, inquiryThumbCount);
            } else {
                log.info("Schema migration: no S3 direct URLs to migrate");
            }
        } catch (Exception e) {
            log.warn("Schema migration: S3 URL migration - {}", e.getMessage());
        }
    }

    private void fixNotificationTypeCheck() {
        try {
            List<String> constraintNames = jdbcTemplate.queryForList(
                    "SELECT conname FROM pg_constraint " +
                            "WHERE conrelid = 'notifications'::regclass AND contype = 'c'",
                    String.class
            );

            log.info("Schema migration: found CHECK constraints on notifications: {}", constraintNames);

            for (String name : constraintNames) {
                jdbcTemplate.execute("ALTER TABLE notifications DROP CONSTRAINT \"" + name + "\"");
                log.info("Schema migration: dropped constraint '{}'", name);
            }

            jdbcTemplate.execute(
                    "ALTER TABLE notifications ADD CONSTRAINT notifications_type_check " +
                            "CHECK (type IN ('COMMENT_MENTION', 'CHECKLIST_ASSIGNED', 'TASK_COMMENT', 'NOTE_COMMENT_MENTION'))"
            );
            log.info("Schema migration: notifications_type_check constraint recreated");
        } catch (Exception e) {
            log.warn("Schema migration: notifications_type_check - {}", e.getMessage());
        }
    }
}
