package com.kanban.domain.report.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * 같은 예약 분(UTC)에 보고서가 두 번 나가는 것을 막는 분산 락 — <b>DB 슬롯 클레임</b> 방식.
 *
 * <p>스케줄러는 매분 돌고 인스턴스는 여러 대다. 두 인스턴스가 같은 분에 동시에 조건을 통과하면
 * 보고서가 두 번 나갈 수 있다. {@code lock_key}(보드·종류·분슬롯)를 PK로 하는
 * {@code report_dispatch_locks} 테이블에 원자적 INSERT를 시도해, 성공한 <b>한 인스턴스만</b>
 * 발송을 맡는다. Redis에 의존하지 않으므로 Redis가 꺼진 환경(dev)에서도 그대로 동작한다.
 *
 * <p>키는 분 단위(날짜 포함)라 다른 예약 시각에는 그대로 다시 발송된다(재발송 제한 없음).
 * 성공 시 행을 남겨 중복을 막고, 오래된 행은 {@link #cleanupStale()}로 스케줄러가 청소한다.
 *
 * <p>PK 충돌은 "이미 다른 인스턴스가 선점"으로 읽어 발송을 건너뛴다. 그 밖의 예기치 못한 DB 오류는
 * 발송을 멈추지 않도록 락 없이 진행한다(fail-open) — 보고서를 못 보내는 것보다 드물게 중복되는 편이 낫다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportDispatchLock {

    /** 이 시간이 지난 슬롯 행은 청소 대상. 예약 분은 하루 한 번뿐이라 넉넉히 잡아도 무해하다. */
    private static final Duration RETENTION = Duration.ofMinutes(30);

    private final ReportDispatchSlotWriter writer;

    /**
     * @return 이 인스턴스가 발송을 맡게 됐으면 true
     */
    public boolean acquire(String boardId, String reportType, LocalDateTime slot) {
        String key = buildKey(boardId, reportType, slot);
        try {
            writer.claim(key, LocalDateTime.now(ZoneOffset.UTC));
            return true;
        } catch (DataIntegrityViolationException e) {
            // 다른 인스턴스가 같은 분에 먼저 선점했다.
            log.debug("발송 슬롯 이미 선점됨 key={}", key);
            return false;
        } catch (Exception e) {
            // 예기치 못한 DB 오류로 발송이 멈추면 안 된다.
            log.warn("발송 슬롯 선점 실패 — 락 없이 진행 key={}: {}", key, e.getMessage());
            return true;
        }
    }

    /**
     * 발송이 실패했을 때 슬롯을 비워, 다음 분에 다시 시도할 수 있게 한다.
     * (성공했으면 비우지 않는다 — 같은 분의 다른 인스턴스가 중복 발송하지 않게 한다)
     */
    public void release(String boardId, String reportType, LocalDateTime slot) {
        try {
            writer.free(buildKey(boardId, reportType, slot));
        } catch (Exception e) {
            log.debug("발송 슬롯 해제 실패: {}", e.getMessage());
        }
    }

    /** 보존 기간이 지난 슬롯 행을 지운다. 스케줄러가 매분 호출한다. @return 지운 행 수 */
    public int cleanupStale() {
        try {
            return writer.cleanup(LocalDateTime.now(ZoneOffset.UTC).minus(RETENTION));
        } catch (Exception e) {
            log.debug("발송 슬롯 청소 실패: {}", e.getMessage());
            return 0;
        }
    }

    /** 분 단위 키(날짜 포함) — 같은 분(UTC)에만 유효하다. 다른 예약 시각이면 키가 달라져 그대로 발송된다. */
    private String buildKey(String boardId, String reportType, LocalDateTime slot) {
        return "report:dispatch:" + reportType + ":" + boardId + ":"
                + slot.truncatedTo(ChronoUnit.MINUTES);
    }
}
