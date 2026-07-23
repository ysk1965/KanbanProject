package com.kanban.domain.report.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;

/**
 * 하루 1회 발송을 보장하는 분산 락.
 *
 * <p>스케줄러는 매분 돌고 인스턴스는 여러 대다. {@code lastSentAt} 시각 비교만으로는
 * 두 인스턴스가 같은 순간에 조건을 통과해 보고서가 두 번 나갈 수 있다.
 * Redis {@code SET NX}로 "이 보드, 이 종류, 이 날짜"를 한 번만 잡게 한다.
 *
 * <p>Redis가 없거나 죽어 있으면 락을 건너뛴다 — 보고서를 못 보내는 것보다
 * 드물게 중복되는 편이 낫고, DB의 {@code lastSentAt} 가드가 2차 방어로 남아 있다.
 */
@Slf4j
@Component
public class ReportDispatchLock {

    private static final Duration TTL = Duration.ofMinutes(10);

    private final ObjectProvider<StringRedisTemplate> redisProvider;

    public ReportDispatchLock(ObjectProvider<StringRedisTemplate> redisProvider) {
        this.redisProvider = redisProvider;
    }

    /**
     * @return 이 인스턴스가 발송을 맡게 됐으면 true
     */
    public boolean acquire(String boardId, String reportType, LocalDate date) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return true;
        }
        String key = buildKey(boardId, reportType, date);
        try {
            Boolean acquired = redis.opsForValue().setIfAbsent(key, "1", TTL);
            return Boolean.TRUE.equals(acquired);
        } catch (Exception e) {
            // 연결 실패로 발송이 멈추면 안 된다.
            log.warn("보고서 발송 락 획득 실패 — 락 없이 진행 key={}: {}", key, e.getMessage());
            return true;
        }
    }

    /**
     * 발송이 실패했을 때 락을 풀어, 다음 분에 다시 시도할 수 있게 한다.
     * (성공했으면 풀지 않는다 — TTL이 지나기 전까지 재발송을 막는 게 목적이다)
     */
    public void release(String boardId, String reportType, LocalDate date) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return;
        }
        try {
            redis.delete(buildKey(boardId, reportType, date));
        } catch (Exception e) {
            log.debug("보고서 발송 락 해제 실패: {}", e.getMessage());
        }
    }

    private String buildKey(String boardId, String reportType, LocalDate date) {
        return "report:dispatch:" + reportType + ":" + boardId + ":" + date;
    }
}
