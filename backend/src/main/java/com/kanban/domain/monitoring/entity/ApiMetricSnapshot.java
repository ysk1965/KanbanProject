package com.kanban.domain.monitoring.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "api_metric_snapshots")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApiMetricSnapshot {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "endpoint", nullable = false, length = 255)
    private String endpoint;

    @Column(name = "http_method", nullable = false, length = 10)
    private String httpMethod;

    @Column(name = "snapshot_time", nullable = false)
    private LocalDateTime snapshotTime;

    @Column(name = "request_count", nullable = false)
    @Builder.Default
    private Integer requestCount = 0;

    @Column(name = "avg_response_ms", nullable = false)
    @Builder.Default
    private Double avgResponseMs = 0.0;

    @Column(name = "max_response_ms", nullable = false)
    @Builder.Default
    private Double maxResponseMs = 0.0;

    @Column(name = "p95_response_ms", nullable = false)
    @Builder.Default
    private Double p95ResponseMs = 0.0;

    @Column(name = "p99_response_ms", nullable = false)
    @Builder.Default
    private Double p99ResponseMs = 0.0;

    @Column(name = "error_count", nullable = false)
    @Builder.Default
    private Integer errorCount = 0;

    @Column(name = "error_rate", nullable = false)
    @Builder.Default
    private Double errorRate = 0.0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
