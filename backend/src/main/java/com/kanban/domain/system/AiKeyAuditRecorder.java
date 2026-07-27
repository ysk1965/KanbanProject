package com.kanban.domain.system;

import com.kanban.global.config.AiProviderType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * AI 키 감사 로그를 <b>독립 트랜잭션</b>으로 기록한다.
 *
 * <p>키 교체 실패는 곧바로 예외를 던져 호출 트랜잭션을 롤백시키는데, 같은 트랜잭션에서
 * 로그를 쓰면 실패 기록도 함께 롤백돼 감사 로그로서 무의미해진다. 그래서
 * {@code REQUIRES_NEW}가 필요하고, Spring AOP 프록시를 타려면 <b>별도 빈</b>이어야 한다
 * (같은 클래스 내 self-invocation은 프록시를 거치지 않는다).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiKeyAuditRecorder {

    private final AiKeyAuditLogRepository auditLogRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AiProviderType provider, AiKeyAuditLog.Action action, String actorUserId,
                       String actorEmail, String maskedKey, boolean success, String detail) {
        try {
            auditLogRepository.save(AiKeyAuditLog.builder()
                    .provider(provider)
                    .action(action)
                    .actorUserId(actorUserId)
                    .actorEmail(actorEmail)
                    .maskedKey(maskedKey)
                    .success(success)
                    .detail(truncate(detail))
                    .build());
        } catch (Exception e) {
            // 감사 로그 기록 실패가 키 교체 자체를 막아서는 안 된다
            log.error("AI 키 감사 로그 기록 실패: {}", e.getMessage());
        }
    }

    /** detail 컬럼은 VARCHAR(500)이다. 예외 메시지가 길어도 저장이 깨지지 않게 자른다. */
    private String truncate(String detail) {
        if (detail == null) return null;
        return detail.length() <= 500 ? detail : detail.substring(0, 497) + "...";
    }
}
