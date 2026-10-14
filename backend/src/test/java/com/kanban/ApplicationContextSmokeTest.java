package com.kanban;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.global.filter.RequestIdFilter;
import io.sentry.Sentry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

/**
 * test 프로파일(H2, 외부 연동 전부 비활성)로 전체 컨텍스트가 뜨는지 확인한다.
 * 빈 배선 실수(순환 참조, 누락된 프로퍼티, 조건부 빈 충돌)는 여기서 가장 먼저 걸린다.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("애플리케이션 컨텍스트 기동 (test 프로파일)")
class ApplicationContextSmokeTest {

    @Autowired
    ApplicationContext context;

    @Test
    @DisplayName("컨텍스트가 뜨고 RequestIdFilter 가 등록된다")
    void contextLoads() {
        assertThat(context.getBean(RequestIdFilter.class)).isNotNull();
    }

    @Test
    @DisplayName("SENTRY_DSN 이 비어 있으면 Sentry SDK 는 비활성(no-op)이다")
    void sentryDisabledWithoutDsn() {
        assertThat(Sentry.isEnabled()).isFalse();
    }
}
