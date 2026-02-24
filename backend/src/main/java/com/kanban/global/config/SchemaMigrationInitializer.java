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

    public SchemaMigrationInitializer(DataSource dataSource) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @Override
    public void afterPropertiesSet() {
        String dbProductName = detectDatabaseProduct();
        if ("H2".equalsIgnoreCase(dbProductName)) {
            log.info("Schema migration: H2 detected, skipping (ddl-auto handles it)");
            return;
        }

        log.info("Schema migration: running pre-JPA schema patches for {}", dbProductName);

        // Notes 테이블
        addColumnIfNotExists("notes", "is_shared", "BOOLEAN NOT NULL DEFAULT FALSE");
        addColumnIfNotExists("notes", "share_token", "VARCHAR(36) UNIQUE");
        addColumnIfNotExists("notes", "ai_suggestions", "TEXT");
        addColumnIfNotExists("notes", "ai_content_snapshot", "TEXT");

        // Personal Events 테이블
        addColumnIfNotExists("personal_events", "event_type", "VARCHAR(20) DEFAULT 'SCHEDULE'");
        fixPersonalEventsEventType();

        // Meetings 테이블 - 화자 분리
        addColumnIfNotExists("meetings", "diarized_transcript", "TEXT");
        addColumnIfNotExists("meetings", "speaker_mapping", "TEXT");
        addColumnIfNotExists("meetings", "ai_suggestions", "TEXT");

        // Notifications CHECK 제약조건
        fixNotificationTypeCheck();

        log.info("Schema migration: pre-JPA patches completed");
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
