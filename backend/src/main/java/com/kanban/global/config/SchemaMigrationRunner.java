package com.kanban.global.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class SchemaMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        addMissingNotesColumns();
        fixNotificationTypeCheck();
    }

    /**
     * notes 테이블에 누락된 컬럼 추가.
     * ddl-auto: update가 NOT NULL 컬럼을 기존 데이터 테이블에 추가 못하는 문제 해결.
     */
    private void addMissingNotesColumns() {
        addColumnIfNotExists("notes", "is_shared", "BOOLEAN NOT NULL DEFAULT FALSE");
        addColumnIfNotExists("notes", "share_token", "VARCHAR(36) UNIQUE");
        addColumnIfNotExists("notes", "ai_suggestions", "TEXT");
        addColumnIfNotExists("notes", "ai_content_snapshot", "TEXT");
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

    /**
     * notifications 테이블의 type CHECK 제약조건을 모두 제거하고 올바른 값으로 재생성.
     * Hibernate 자동 생성 제약조건 이름이 다를 수 있으므로 이름에 의존하지 않고 동적 탐색.
     */
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
