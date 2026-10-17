package com.kanban.domain.subscription;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Persistable;

/**
 * Polar 웹훅 한 건의 수신 기록 — 재전송 멱등성의 근거.
 *
 * <p>Polar(Standard Webhooks)는 2xx 를 못 받으면 같은 {@code webhook-id} 로 재전송한다. 그 id 를 PK 로 두고
 * <b>원자적 INSERT</b>로 선점하면 인스턴스 수와 무관하게 한 번만 처리된다. INSERT 의 PK 충돌이 곧
 * "이미 받은 이벤트"라는 신호다 — {@code ReportDispatchSlot} 과 같은 패턴.
 *
 * <p>상태 전이: {@code PROCESSING} → {@code PROCESSED} | {@code FAILED}. FAILED 는 재전송 때 다시 선점해
 * 처리하고, 인스턴스가 죽어 PROCESSING 에 오래 멈춘 행도 같은 방식으로 되살린다. {@code attempts} 가
 * 재선점의 낙관적 락 역할을 한다.
 */
@Entity
@Table(
        name = "polar_webhook_events",
        indexes = @Index(name = "idx_polar_webhook_events_received_at", columnList = "received_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PolarWebhookDelivery implements Persistable<String> {

    public static final int ERROR_MESSAGE_MAX_LENGTH = 2000;

    /** Standard Webhooks 의 {@code webhook-id} 헤더 — 재전송에도 같은 값 */
    @Id
    @Column(name = "id", length = 255)
    private String id;

    @Column(name = "event_type", length = 100)
    private String eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PolarWebhookDeliveryStatus status;

    /** 선점 횟수 — 재선점(FAILED/멈춘 PROCESSING)의 낙관적 락 */
    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "error_message", length = ERROR_MESSAGE_MAX_LENGTH)
    private String errorMessage;

    @Transient
    @Getter(AccessLevel.NONE)
    private boolean newRecord = true;

    public PolarWebhookDelivery(String id, String eventType, LocalDateTime receivedAt) {
        this.id = id;
        this.eventType = eventType;
        this.status = PolarWebhookDeliveryStatus.PROCESSING;
        this.attempts = 1;
        this.receivedAt = receivedAt;
        this.updatedAt = receivedAt;
    }

    public void markProcessed(LocalDateTime now) {
        this.status = PolarWebhookDeliveryStatus.PROCESSED;
        this.errorMessage = null;
        this.updatedAt = now;
    }

    public void markFailed(String error, LocalDateTime now) {
        this.status = PolarWebhookDeliveryStatus.FAILED;
        this.errorMessage = truncate(error);
        this.updatedAt = now;
    }

    public static String truncate(String error) {
        if (error == null) return null;
        return error.length() <= ERROR_MESSAGE_MAX_LENGTH ? error : error.substring(0, ERROR_MESSAGE_MAX_LENGTH);
    }

    /**
     * 항상 persist(INSERT)로 가게 한다 — 문자열 PK 라 기본 {@code save()} 는 merge(SELECT 후 UPDATE)를 쳐서
     * 중복 INSERT 가 조용히 UPDATE 로 바뀌어 버린다. 영속화·로드 뒤에는 보통 엔티티처럼 동작한다.
     */
    @Override
    public boolean isNew() {
        return newRecord;
    }

    @PostPersist
    @PostLoad
    void markNotNew() {
        this.newRecord = false;
    }
}
