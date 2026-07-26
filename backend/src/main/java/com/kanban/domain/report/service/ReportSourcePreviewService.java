package com.kanban.domain.report.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.BoardReportConfigRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportPreviewResponse;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 저장 전에 "실제로 이만큼 잡힌다"를 보여주는 미리보기.
 *
 * <p>AI를 태우지 않고 <b>수집만</b> 한다. 라벨이나 브랜치를 잘못 넣었으면 0건으로 바로 드러나게 하는 것이
 * 이 엔드포인트의 존재 이유다. 이후 모든 단계의 디버깅 창구이기도 하다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportSourcePreviewService {

    private final BoardService boardService;
    private final BoardReportConfigRepository configRepository;
    private final List<ReportSource> sources;

    @Transactional(readOnly = true)
    public ReportPreviewResponse preview(String boardId, String userId, ReportType reportType) {
        boardService.checkMemberOrAbove(boardId, userId);

        Optional<BoardReportConfig> configOpt = configRepository.findByBoardId(boardId);
        ZoneId zone = configOpt.map(c -> ZoneId.of(c.getTimezone())).orElse(ZoneId.of("Asia/Seoul"));
        ZonedDateTime now = ZonedDateTime.now(zone);

        ReportPeriod period = resolvePeriod(reportType, configOpt, now, zone);

        List<ReportPreviewResponse.SourceResult> results = new ArrayList<>();
        for (ReportSource source : sources) {
            if (!isEnabled(source, configOpt)) {
                continue;
            }
            results.add(runOne(source, boardId, period));
        }

        return ReportPreviewResponse.builder()
                .reportType(reportType.name())
                .periodStart(period.startInclusive().toString())
                .periodEnd(period.endExclusive().toString())
                .periodLabel(period.label())
                .timezone(zone.getId())
                .sources(results)
                .build();
    }

    /**
     * 소스 하나가 터져도 미리보기 전체가 실패하면 안 된다 — 어느 소스가 문제인지 보려고 부르는 화면이다.
     */
    private ReportPreviewResponse.SourceResult runOne(ReportSource source, String boardId,
                                                      ReportPeriod period) {
        try {
            if (!source.isConfigured(boardId)) {
                return ReportPreviewResponse.SourceResult.builder()
                        .kind(source.kind().name())
                        .configured(false)
                        .success(false)
                        .summary("연결되지 않음")
                        .build();
            }
            // 미리보기는 자료실에 파일을 등록하지 않는다 — 발송하지 않은 회차의 이미지가 쌓이지 않게.
            SourceChunk chunk = source.collectForPreview(boardId, period);
            return ReportPreviewResponse.SourceResult.builder()
                    .kind(source.kind().name())
                    .configured(true)
                    .success(chunk.success())
                    .hasData(chunk.hasData())
                    .summary(chunk.summary())
                    .errorMessage(chunk.errorMessage())
                    .metrics(chunk.metrics())
                    .build();
        } catch (Exception e) {
            log.warn("미리보기 수집 실패 board={} source={}: {}", boardId, source.kind(), e.getMessage());
            return ReportPreviewResponse.SourceResult.builder()
                    .kind(source.kind().name())
                    .configured(true)
                    .success(false)
                    .summary("수집 중 오류")
                    .errorMessage(e.getMessage())
                    .build();
        }
    }

    private boolean isEnabled(ReportSource source, Optional<BoardReportConfig> configOpt) {
        if (configOpt.isEmpty()) {
            return true;   // 설정 저장 전에도 미리보기는 돌아야 한다
        }
        BoardReportConfig config = configOpt.get();
        return switch (source.kind()) {
            case GITHUB -> Boolean.TRUE.equals(config.getSourceGithubEnabled());
            case KANBAN -> Boolean.TRUE.equals(config.getSourceKanbanEnabled());
            case CONFLUENCE -> Boolean.TRUE.equals(config.getSourceConfluenceEnabled());
            case SLACK -> Boolean.TRUE.equals(config.getSourceSlackEnabled());
        };
    }

    /**
     * 미리보기 구간은 <b>가장 최근에 지나간 발송 시각</b>을 끝점으로 잡는다.
     * 지금 시각까지로 잡으면 실제 발송과 구간 모양이 달라 "이만큼 잡힌다"가 거짓이 된다.
     */
    private ReportPeriod resolvePeriod(ReportType reportType, Optional<BoardReportConfig> configOpt,
                                       ZonedDateTime now, ZoneId zone) {
        if (reportType == ReportType.WEEKLY_INTEGRATED) {
            DayOfWeek boundary = configOpt
                    .map(c -> DayOfWeek.of(c.getWeeklyDayOfWeek()))
                    .orElse(DayOfWeek.SATURDAY);
            int[] hm = localSendTime(configOpt, zone, true);
            return ReportPeriod.previewWeekly(now, boundary, hm[0], hm[1]);
        }
        int[] hm = localSendTime(configOpt, zone, false);
        return ReportPeriod.previewDaily(now, hm[0], hm[1]);
    }

    /** 저장은 UTC로 하므로 보드 타임존의 시:분으로 되돌린다. */
    private int[] localSendTime(Optional<BoardReportConfig> configOpt, ZoneId zone, boolean weekly) {
        int hourUtc = configOpt.map(c -> weekly ? c.getWeeklySendHourUtc() : c.getDailySendHourUtc()).orElse(0);
        int minuteUtc = configOpt.map(c -> weekly ? c.getWeeklySendMinuteUtc() : c.getDailySendMinuteUtc()).orElse(0);

        ZonedDateTime utc = ZonedDateTime.now(ZoneId.of("UTC"))
                .withHour(hourUtc).withMinute(minuteUtc).withSecond(0).withNano(0);
        ZonedDateTime local = utc.withZoneSameInstant(zone);
        return new int[]{local.getHour(), local.getMinute()};
    }
}
