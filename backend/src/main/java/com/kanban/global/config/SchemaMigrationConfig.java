package com.kanban.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.orm.jpa.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * 스키마 마이그레이션이 JPA EntityManagerFactory 초기화 전에 실행되도록 보장.
 *
 * 실행 순서 (dev/prod): DataSource → Flyway → SchemaMigrationInitializer → JPA
 * 실행 순서 (local H2):  DataSource → SchemaMigrationInitializer(스킵) → JPA(ddl-auto: update)
 *
 * SchemaMigrationInitializer는 모든 패치가 멱등(idempotent)하므로
 * Flyway와의 실행 순서에 무관하게 안전합니다.
 */
@Configuration
public class SchemaMigrationConfig {

    @Value("${app.file.cloudfront-domain:}")
    private String cloudfrontDomain;

    @Value("${app.file.s3-bucket:bridge-kanban-attachments}")
    private String s3Bucket;

    @Bean
    public SchemaMigrationInitializer schemaMigrationInitializer(DataSource dataSource) {
        return new SchemaMigrationInitializer(dataSource, cloudfrontDomain, s3Bucket);
    }

    @Bean
    public static EntityManagerFactoryDependsOnPostProcessor schemaMigrationDependency() {
        return new EntityManagerFactoryDependsOnPostProcessor("schemaMigrationInitializer");
    }
}
