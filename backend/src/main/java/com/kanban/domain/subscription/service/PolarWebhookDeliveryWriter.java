package com.kanban.domain.subscription.service;

import com.kanban.domain.subscription.PolarWebhookDelivery;
import com.kanban.domain.subscription.PolarWebhookDeliveryRepository;
import com.kanban.domain.subscription.PolarWebhookDeliveryStatus;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link PolarWebhookDelivery} 행을 <b>각각 짧은 독립 트랜잭션</b>으로 다룬다.
 *
 * <p>선점 INSERT 는 처리 트랜잭션과 분리돼야 한다 — 같은 트랜잭션이면 PK 충돌로 트랜잭션 전체가 깨지고,
 * 처리 실패 롤백이 선점 기록까지 지워 버린다. {@code REQUIRES_NEW} 라 호출부가 트랜잭션 안이든
 * 밖이든 같은 의미로 동작한다. 별도 빈인 이유는 self-invocation 에 프록시가 안 걸리기 때문.
 */
@Component
@RequiredArgsConstructor
public class PolarWebhookDeliveryWriter {

    private final PolarWebhookDeliveryRepository repository;

    /**
     * 새 행을 INSERT 해 선점한다. 이미 있으면 PK 충돌로 {@code DataIntegrityViolationException} 이 나고
     * 이 트랜잭션만 롤백된다 — 호출부는 그 예외를 "이미 수신한 이벤트"로 읽는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insertNew(String webhookId, String eventType, LocalDateTime now) {
        repository.saveAndFlush(new PolarWebhookDelivery(webhookId, eventType, now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<PolarWebhookDelivery> find(String webhookId) {
        return repository.findById(webhookId);
    }

    /** FAILED / 멈춘 PROCESSING 행 재선점. 동시 재전송 중 하나만 true 를 받는다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean reclaim(String webhookId, int expectedAttempts, LocalDateTime now) {
        return repository.reclaim(webhookId, expectedAttempts, PolarWebhookDeliveryStatus.PROCESSING, now) == 1;
    }

    /**
     * 처리 완료 표시. 일부러 {@code REQUIRED} — 처리 트랜잭션에 합류해 핸들러 변경과 함께 커밋/롤백된다.
     * (처리는 커밋됐는데 표식만 빠지거나, 그 반대가 되는 일이 없다.)
     */
    @Transactional
    public void markProcessed(String webhookId, LocalDateTime now) {
        repository.findById(webhookId).ifPresent(d -> d.markProcessed(now));
    }

    /** 처리 실패 표시. 처리 트랜잭션은 롤백되므로 독립 트랜잭션으로 남긴다 — 재전송 때 다시 처리하게. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(String webhookId, String error, LocalDateTime now) {
        repository.findById(webhookId).ifPresent(d -> d.markFailed(error, now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int deleteReceivedBefore(LocalDateTime before) {
        return repository.deleteReceivedBefore(before);
    }
}
