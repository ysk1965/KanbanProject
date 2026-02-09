package com.kanban.global.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class SchemaMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        fixNotificationTypeCheck();
    }

    /**
     * V18: notifications 테이블의 type CHECK 제약조건에 TASK_COMMENT 추가
     */
    private void fixNotificationTypeCheck() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check"
            );
            jdbcTemplate.execute(
                "ALTER TABLE notifications ADD CONSTRAINT notifications_type_check " +
                "CHECK (type IN ('COMMENT_MENTION', 'CHECKLIST_ASSIGNED', 'TASK_COMMENT'))"
            );
            log.info("Schema migration: notifications_type_check constraint updated");
        } catch (Exception e) {
            log.warn("Schema migration: notifications_type_check - {}", e.getMessage());
        }
    }
}
