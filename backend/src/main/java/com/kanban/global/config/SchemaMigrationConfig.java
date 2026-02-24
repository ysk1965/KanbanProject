package com.kanban.global.config;

import org.springframework.boot.autoconfigure.orm.jpa.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * 스키마 마이그레이션이 JPA EntityManagerFactory 초기화 전에 실행되도록 보장.
 *
 * EntityManagerFactoryDependsOnPostProcessor를 사용하여
 * 모든 EntityManagerFactory 빈이 schemaMigrationInitializer에 의존하도록 설정.
 * 이는 Spring Boot에서 Flyway/Liquibase가 동작하는 것과 동일한 메커니즘.
 *
 * 실행 순서: DataSource → SchemaMigrationInitializer → EntityManagerFactory(JPA)
 */
@Configuration
public class SchemaMigrationConfig {

    @Bean
    public SchemaMigrationInitializer schemaMigrationInitializer(DataSource dataSource) {
        return new SchemaMigrationInitializer(dataSource);
    }

    @Bean
    public static EntityManagerFactoryDependsOnPostProcessor schemaMigrationDependency() {
        return new EntityManagerFactoryDependsOnPostProcessor("schemaMigrationInitializer");
    }
}
