package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardReportConfigRepository extends JpaRepository<BoardReportConfig, String> {

    Optional<BoardReportConfig> findByBoardId(String boardId);

    /**
     * 매분 스케줄러가 현재 UTC 시·분에 해당하는 일일 보고서 설정을 집어간다.
     *
     * <p>보드와 발송 채널을 {@code JOIN FETCH}하는 이유는, 발송이 트랜잭션 밖에서 오래 돌기 때문이다.
     * 지연 로딩으로 두면 스케줄러가 보드나 채널 목록을 건드리는 순간 터진다.
     */
    @Query("""
        SELECT DISTINCT c FROM BoardReportConfig c
        JOIN FETCH c.board
        LEFT JOIN FETCH c.deliveryChannels
        WHERE c.dailyEnabled = true
          AND c.dailySendHourUtc = :hour
          AND c.dailySendMinuteUtc = :minute
        """)
    List<BoardReportConfig> findEnabledDailyByUtcTime(@Param("hour") int hour,
                                                      @Param("minute") int minute);

    /** 주간은 요일까지 함께 맞춘다 (ISO 1=월 ~ 7=일, UTC 기준). */
    @Query("""
        SELECT DISTINCT c FROM BoardReportConfig c
        JOIN FETCH c.board
        LEFT JOIN FETCH c.deliveryChannels
        WHERE c.weeklyEnabled = true
          AND c.weeklyDayOfWeek = :dayOfWeek
          AND c.weeklySendHourUtc = :hour
          AND c.weeklySendMinuteUtc = :minute
        """)
    List<BoardReportConfig> findEnabledWeeklyByUtcTime(@Param("dayOfWeek") int dayOfWeek,
                                                       @Param("hour") int hour,
                                                       @Param("minute") int minute);
}
