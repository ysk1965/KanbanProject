package com.kanban.global.config;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * 스케줄러 분산 락 설정.
 *
 * 무중단 배포(RollingWithAdditionalBatch)의 겹침 구간이나 오토스케일로
 * 인스턴스가 2대 이상 떠 있을 때 @Scheduled 작업이 중복 실행되는 것을 막는다.
 * 락은 DB의 shedlock 테이블 한 행으로 관리되며 추가 인프라가 필요 없다.
 *
 * usingDbTime(): 인스턴스 간 시계 차이에 영향받지 않도록 DB 서버 시간을 기준으로 잠근다.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        // 로컬 H2는 Flyway가 꺼져 있고 ddl-auto는 엔티티만 만들므로 여기서 멱등 생성한다.
        // (dev/prod PostgreSQL은 Flyway 마이그레이션이 만들지만 IF NOT EXISTS라 중복 실행 무해)
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS shedlock (
                    name VARCHAR(64) NOT NULL,
                    lock_until TIMESTAMP NOT NULL,
                    locked_at TIMESTAMP NOT NULL,
                    locked_by VARCHAR(255) NOT NULL,
                    PRIMARY KEY (name)
                )""");
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(jdbcTemplate)
                        .usingDbTime()
                        .build());
    }
}
