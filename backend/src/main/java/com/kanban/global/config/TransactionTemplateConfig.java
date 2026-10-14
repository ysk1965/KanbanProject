package com.kanban.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 프로그램적 트랜잭션 템플릿.
 *
 * <p>AI 서비스처럼 "DB 읽기 → 외부 HTTP(LLM) → DB 쓰기" 순서로 가는 메서드는 {@code @Transactional}을
 * 메서드 전체에 걸 수 없다(LLM 왕복 내내 커넥션을 쥐게 된다). 대신 읽기/쓰기 구간만 이 템플릿으로 감싸고
 * 외부 호출은 그 사이에 둔다. 같은 빈 안의 private 메서드에 {@code @Transactional}을 붙여도 프록시를
 * 안 타서 소용없기 때문에 이 방식이 더 믿을 만하다.
 *
 * <p>Spring Boot가 자동 등록하는 {@code TransactionTemplate}은 이 설정이 있으면 물러난다
 * ({@code @ConditionalOnMissingBean(TransactionOperations)}). 그래서 기본 템플릿도 여기서 함께 정의한다.
 */
@Configuration
public class TransactionTemplateConfig {

    /** 읽기·쓰기 공용 (REQUIRED). 주입 시 별도 한정자 없이 {@code TransactionTemplate}으로 받는다. */
    @Bean
    @Primary
    public TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }

    /** 읽기 전용 (REQUIRED + readOnly). {@code @Qualifier("readOnlyTransactionTemplate")}로 받는다. */
    @Bean("readOnlyTransactionTemplate")
    public TransactionTemplate readOnlyTransactionTemplate(PlatformTransactionManager transactionManager) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setReadOnly(true);
        return template;
    }
}
