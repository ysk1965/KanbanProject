package com.kanban.domain.report.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.BoardReportConfigRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportConfigDto;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;

/**
 * 보드별 발송 설정 조회·수정.
 *
 * <p>화면은 보드 타임존의 시각(09:00)을 다루고, 저장은 UTC로 한다.
 * 이 변환을 서버가 독점해야 프론트마다 다르게 계산하는 사고가 없다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportConfigService {

    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BoardReportConfigRepository configRepository;
    private final ReportDispatchService dispatchService;

    @Transactional
    public ReportConfigDto.Detail get(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return ReportConfigDto.Detail.from(getOrCreate(boardId));
    }

    @Transactional
    public ReportConfigDto.Detail update(String boardId, String userId, ReportConfigDto.Update request) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);

        // 타임존이 함께 바뀌면 새 타임존 기준으로 환산해야 한다.
        String timezone = request.getTimezone() != null ? request.getTimezone() : config.getTimezone();
        ZoneId zone = parseZone(timezone);

        config.updateCommon(timezone, request.getLanguage(),
                request.getSlackChannelId(), request.getSlackChannelName());

        if (request.getDailyHour() != null || request.getDailyMinute() != null
                || request.getDailyEnabled() != null) {
            int[] utc = toUtc(request.getDailyHour(), request.getDailyMinute(), zone,
                    config.getDailySendHourUtc(), config.getDailySendMinuteUtc());
            config.updateDaily(request.getDailyEnabled(), utc[0], utc[1]);
        }

        if (request.getWeeklyHour() != null || request.getWeeklyMinute() != null
                || request.getWeeklyEnabled() != null || request.getWeeklyDayOfWeek() != null) {
            int[] utc = toUtc(request.getWeeklyHour(), request.getWeeklyMinute(), zone,
                    config.getWeeklySendHourUtc(), config.getWeeklySendMinuteUtc());
            Integer dayOfWeek = resolveUtcDayOfWeek(request, zone, config);
            config.updateWeekly(request.getWeeklyEnabled(), utc[0], utc[1], dayOfWeek);
        }

        config.updateSources(request.getSourceGithubEnabled(), request.getSourceKanbanEnabled(),
                request.getSourceConfluenceEnabled());
        config.updateShareLink(request.getShareLinkEnabled());

        return ReportConfigDto.Detail.from(config);
    }

    /**
     * 스케줄과 무관하게 지금 한 번 보낸다. 설정을 마친 뒤 "정말 이렇게 나가는지" 확인하는 용도.
     */
    @Transactional
    public String dispatchNow(String boardId, String userId, ReportType reportType) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);
        Board board = config.getBoard();

        ZonedDateTime sendAt = ZonedDateTime.now(parseZone(config.getTimezone()));
        ReportDispatchService.DispatchResult result =
                dispatchService.dispatch(board, config, reportType, sendAt);

        if (result.reportId() == null) {
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED,
                    result.message() != null ? result.message() : "보고서를 만들지 못했습니다");
        }
        return result.reportId();
    }

    private BoardReportConfig getOrCreate(String boardId) {
        return configRepository.findByBoardId(boardId)
                .orElseGet(() -> {
                    Board board = boardRepository.findById(boardId)
                            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
                    return configRepository.save(BoardReportConfig.builder().board(board).build());
                });
    }

    private ZoneId parseZone(String timezone) {
        try {
            return ZoneId.of(timezone);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "알 수 없는 타임존: " + timezone);
        }
    }

    /** 보드 타임존의 시:분 → UTC 시:분 */
    private int[] toUtc(Integer hour, Integer minute, ZoneId zone, int fallbackHourUtc, int fallbackMinuteUtc) {
        if (hour == null && minute == null) {
            return new int[]{fallbackHourUtc, fallbackMinuteUtc};
        }
        int h = hour != null ? hour : 0;
        int m = minute != null ? minute : 0;
        if (h < 0 || h > 23 || m < 0 || m > 59) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "발송 시각이 올바르지 않습니다");
        }
        ZonedDateTime local = ZonedDateTime.now(zone).withHour(h).withMinute(m).withSecond(0).withNano(0);
        ZonedDateTime utc = local.withZoneSameInstant(ZoneOffset.UTC);
        return new int[]{utc.getHour(), utc.getMinute()};
    }

    /**
     * 요일도 UTC로 옮겨야 한다. 토요일 09:00 KST는 UTC로도 토요일 00:00이지만,
     * 예컨대 월요일 08:00 KST는 <b>일요일</b> 23:00 UTC다 — 그냥 저장하면 하루 어긋난다.
     */
    private Integer resolveUtcDayOfWeek(ReportConfigDto.Update request, ZoneId zone, BoardReportConfig config) {
        if (request.getWeeklyDayOfWeek() == null) {
            return null;
        }
        int dow = request.getWeeklyDayOfWeek();
        if (dow < 1 || dow > 7) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "요일은 1(월)~7(일)이어야 합니다");
        }
        int hour = request.getWeeklyHour() != null ? request.getWeeklyHour() : 9;
        int minute = request.getWeeklyMinute() != null ? request.getWeeklyMinute() : 0;

        ZonedDateTime local = ZonedDateTime.now(zone)
                .with(java.time.temporal.TemporalAdjusters.nextOrSame(DayOfWeek.of(dow)))
                .withHour(hour).withMinute(minute).withSecond(0).withNano(0);
        return local.withZoneSameInstant(ZoneOffset.UTC).getDayOfWeek().getValue();
    }
}
