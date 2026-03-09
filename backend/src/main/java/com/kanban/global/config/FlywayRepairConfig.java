package com.kanban.global.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Flyway repair-before-migrate 전략.
 * - 실패한 마이그레이션 레코드 제거
 * - 변경된 마이그레이션 파일의 체크섬 갱신
 * - 삭제된 마이그레이션 파일의 레코드 정리
 */
@Slf4j
@Configuration
@Profile({"dev", "prod"})
public class FlywayRepairConfig {

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            log.info("[Flyway] Running repair before migrate...");
            flyway.repair();
            flyway.migrate();
        };
    }
}
