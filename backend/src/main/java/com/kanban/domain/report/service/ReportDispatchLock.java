package com.kanban.domain.report.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 같은 분에 중복 발송되는 것을 막는 분산 락.
 *
 * <p>스케줄러는 매분 돌고 인스턴스는 여러 대다. 두 인스턴스가 같은 분에 동시에 조건을
 * 통과하면 보고서가 두 번 나갈 수 있다. Redis {@code SET NX}로 "이 보드, 이 종류,
 * 이 분(UTC)"을 한 번만 잡게 한다. 날짜 단위가 아니라 <b>분 단위</b>라, 같은 날 다른
 * 예약 시각에는 그대로 다시 발송된다(재발송 제한 없음).
 *
 * <p>Redis가 없거나 죽어 있으면 락을 건너뛴다 — 보고서를 못 보내는 것보다
 * 드물게 중복되는 편이 낫다.
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
    public boolean acquire(String boardId, String reportType, LocalDateTime slot) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return true;
        }
        String key = buildKey(boardId, reportType, slot);
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
     * (성공했으면 풀지 않는다 — 같은 분의 다른 인스턴스가 중복 발송하지 않게 한다)
     */
    public void release(String boardId, String reportType, LocalDateTime slot) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return;
        }
        try {
            redis.delete(buildKey(boardId, reportType, slot));
        } catch (Exception e) {
            log.debug("보고서 발송 락 해제 실패: {}", e.getMessage());
        }
    }

    /** 분 단위 키 — 같은 분(UTC)에만 유효하다. 다른 예약 시각이면 키가 달라져 그대로 발송된다. */
    private String buildKey(String boardId, String reportType, LocalDateTime slot) {
        return "report:dispatch:" + reportType + ":" + boardId + ":"
                + slot.truncatedTo(ChronoUnit.MINUTES);
    }
}
