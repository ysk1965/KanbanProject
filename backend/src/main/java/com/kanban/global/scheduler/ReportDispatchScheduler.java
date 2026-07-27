package com.kanban.global.scheduler;

import com.kanban.domain.board.Board;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.BoardReportConfigRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.service.ReportDispatchLock;
import com.kanban.domain.report.service.ReportDispatchService;
import com.kanban.domain.report.service.ReportPersistenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.List;

/**
 * 자동 보고서 발송 스케줄러.
 *
 * <p>매분 도는 이유는 보드마다 발송 시각과 타임존이 다르기 때문이다
 * ({@code DailyStandupScheduler}와 같은 방식). 설정은 UTC 시·분으로 저장돼 있어
 * 현재 UTC 시각과 일치하는 것만 집어간다.
 *
 * <p>재발송 제한(날짜 단위·12시간 가드)은 두지 않는다 — 예약 시각과 일치하면 같은 날
 * 몇 번이든 발송한다. 다만 인스턴스가 여러 대일 때 <b>같은 분</b>에 동시에 통과해 두 번
 * 나가는 것만 DB 슬롯 클레임(분 단위, {@link ReportDispatchLock})으로 막는다 —
 * Redis가 꺼진 환경에서도 동작하도록 DB 원자적 INSERT에 기댄다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportDispatchScheduler {

    private final BoardReportConfigRepository configRepository;
    private final ReportDispatchService dispatchService;
    private final ReportPersistenceService persistence;
    private final ReportDispatchLock dispatchLock;

    /** 프로세스가 죽어 RUNNING인 채로 남은 발송 로그를 FAILED로 보는 기준(분) */
    private static final int STALE_RUNNING_MINUTES = 15;

    @Scheduled(cron = "0 * * * * *")
    public void dispatchReports() {
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        int hour = nowUtc.getHour();
        int minute = nowUtc.getMinute();

        // 방치된 RUNNING 행을 먼저 정리 — 화면의 "발송 중" 스피너가 영원히 돌지 않게.
        int cleaned = persistence.failStaleRunning(STALE_RUNNING_MINUTES);
        if (cleaned > 0) {
            log.warn("방치된 RUNNING 발송 로그 {}건을 FAILED로 정리했습니다", cleaned);
        }

        // 성공 발송이 남긴 오래된 슬롯 행을 걷어낸다 — 발송 자체엔 영향 없는 청소.
        int cleanedSlots = dispatchLock.cleanupStale();
        if (cleanedSlots > 0) {
            log.debug("오래된 발송 슬롯 {}건을 정리했습니다", cleanedSlots);
        }

        List<BoardReportConfig> daily = configRepository.findEnabledDailyByUtcTime(hour, minute);
        List<BoardReportConfig> weekly = configRepository.findEnabledWeeklyByUtcTime(
                nowUtc.getDayOfWeek().getValue(), hour, minute);

        if (daily.isEmpty() && weekly.isEmpty()) {
            return;
        }
        log.info("자동 보고서: 일일 {}건, 주간 {}건 처리 시작 ({}:{} UTC)",
                daily.size(), weekly.size(), hour, minute);

        daily.forEach(config -> runSafely(config, ReportType.DAILY_DEV, nowUtc));
        weekly.forEach(config -> runSafely(config, ReportType.WEEKLY_INTEGRATED, nowUtc));
    }

    private void runSafely(BoardReportConfig config, ReportType reportType, LocalDateTime nowUtc) {
        String boardId;
        try {
            boardId = config.getBoard().getId();
        } catch (Exception e) {
            log.warn("보고서 설정의 보드를 읽을 수 없습니다: {}", e.getMessage());
            return;
        }

        try {
            processOne(config, reportType, nowUtc);
        } catch (Exception e) {
            log.error("보고서 발송 실패 board={} type={}: {}", boardId, reportType, e.getMessage(), e);
            dispatchLock.release(boardId, reportType.name(), nowUtc);
        }
    }

    /**
     * 트랜잭션 없이 돈다 — 수집(HTTP)과 AI 호출이 수십 초 걸리므로 커넥션을 붙들면 안 된다.
     * 보드는 조회 쿼리에서 {@code JOIN FETCH}로 이미 가져와 뒀다.
     */
    private void processOne(BoardReportConfig config, ReportType reportType, LocalDateTime nowUtc) {
        Board board = config.getBoard();
        String boardId = board.getId();

        // 인스턴스가 여러 대여도 같은 분에는 한 번만 통과한다(분 단위 락).
        // 날짜 단위 재발송 제한·12시간 가드는 없앴다 — 예약 시각마다 그대로 발송한다.
        if (!dispatchLock.acquire(boardId, reportType.name(), nowUtc)) {
            log.debug("다른 인스턴스가 이미 발송 중 board={} type={}", boardId, reportType);
            return;
        }

        ZonedDateTime sendAt = ReportDispatchService.sendAtIn(config, nowUtc);
        ReportDispatchService.DispatchResult result =
                dispatchService.dispatch(board, config, reportType, sendAt);

        if (result.isSent()) {
            persistence.markSent(boardId, reportType, nowUtc);
            log.info("보고서 발송 완료 board={} type={} status={}", boardId, reportType, result.status());
        } else {
            // 실패했으면 락을 풀어 다음 분에 다시 시도할 수 있게 한다.
            dispatchLock.release(boardId, reportType.name(), nowUtc);
            log.info("보고서 미발송 board={} type={} status={} reason={}",
                    boardId, reportType, result.status(), result.message());
        }
    }
}
