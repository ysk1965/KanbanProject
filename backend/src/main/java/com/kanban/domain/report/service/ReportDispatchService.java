package com.kanban.domain.report.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.ReportDeliveryStatus;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 보고서 하나를 만들어 내보내는 전 과정: 수집 → 작성 → 저장 → 게시 → 기록.
 *
 * <p>소스 하나가 실패해도 나머지로 진행한다. 모을 게 아무것도 없으면 발송을 건너뛴다 —
 * 빈 보고서가 매일 아침 올라오면 팀이 그 채널을 무시하게 된다.
 *
 * <p>이 메서드는 <b>트랜잭션 밖에서</b> 돈다. 수집(HTTP)과 AI 호출이 수십 초 걸릴 수 있어서,
 * DB 쓰기는 {@link ReportPersistenceService}에 짧게 위임한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportDispatchService {

    private final List<ReportSource> sources;
    private final ReportComposer composer;
    private final ReportSlackPublisher slackPublisher;
    private final ReportPersistenceService persistence;
    private final WeeklyRollupCollector weeklyRollupCollector;

    public record DispatchResult(ReportDeliveryStatus status, String reportId, String message) {
        public boolean isSent() {
            return status == ReportDeliveryStatus.SUCCESS || status == ReportDeliveryStatus.PARTIAL;
        }
    }

    /**
     * 렌더링 미리보기 결과. 저장·발송 없이 "실제로 이렇게 나온다"만 담는다.
     *
     * @param content   AI 작성 본문. 수집된 데이터가 없으면 null (그땐 AI를 호출하지 않는다).
     * @param chunks    소스별 수집 결과 — 페이지의 소스 배지·실패 경고에 쓴다.
     * @param mergedInput 커밋 목록 등 수집 원본 JSON. 페이지 하단 상세 표에 쓴다.
     */
    public record RenderResult(ReportContent content, List<SourceChunk> chunks,
                               String mergedInput, ReportPeriod period, boolean hasData) {
    }

    public DispatchResult dispatch(Board board, BoardReportConfig config, ReportType reportType,
                                   ZonedDateTime sendAt) {
        ReportPeriod period = reportType == ReportType.WEEKLY_INTEGRATED
                ? ReportPeriod.weekly(sendAt)
                : ReportPeriod.daily(sendAt);

        // 1. 수집 — 실패는 예외가 아니라 값으로 받는다.
        //    주간은 그 주 일일 보고서를 재활용(롤업)하고, 빠진 날만 원본을 보충한다.
        Collected collected = collectForReport(board.getId(), config, reportType, period, sendAt);
        List<SourceChunk> chunks = collected.chunks();

        if (chunks.stream().noneMatch(SourceChunk::hasData)) {
            boolean anyFailure = chunks.stream().anyMatch(c -> !c.success());
            ReportDeliveryStatus status = anyFailure
                    ? ReportDeliveryStatus.FAILED : ReportDeliveryStatus.SKIPPED;
            String message = anyFailure ? "모든 소스 수집 실패" : "기간 내 활동 없음";
            persistence.recordLog(board, null, reportType, status,
                    config.getSlackChannelId(), chunks, message);
            return new DispatchResult(status, null, message);
        }

        // 2. 작성 — AI 호출 1회. 여기서 슬랙 요약과 페이지 본문이 함께 나온다.
        ReportComposer.Composed composed;
        try {
            composed = composer.compose(board.getId(), reportType, config.getLanguage(), period,
                    chunks, collected.digests());
        } catch (Exception e) {
            log.error("보고서 작성 실패 board={} type={}: {}", board.getId(), reportType, e.getMessage(), e);
            persistence.recordLog(board, null, reportType, ReportDeliveryStatus.FAILED,
                    config.getSlackChannelId(), chunks, "AI 작성 실패: " + e.getMessage());
            return new DispatchResult(ReportDeliveryStatus.FAILED, null, e.getMessage());
        }

        // 3. 저장 — 공유 토큰은 여기서 발급된다
        String shareToken = Boolean.TRUE.equals(config.getShareLinkEnabled())
                ? UUID.randomUUID().toString().replace("-", "")
                : null;
        ReportContent content = composed.content();
        WeeklyReport report = persistence.save(board, reportType, period, content,
                composed.contentJson(), composed.mergedInput(), chunks, shareToken);

        // 4. 게시 — 1회 재시도
        boolean published = publishWithRetry(board, config, reportType, content, period, shareToken);

        boolean partial = chunks.stream().anyMatch(c -> !c.success());
        ReportDeliveryStatus status = !published
                ? ReportDeliveryStatus.FAILED
                : (partial ? ReportDeliveryStatus.PARTIAL : ReportDeliveryStatus.SUCCESS);

        persistence.recordLog(board, report, reportType, status,
                config.getSlackChannelId(), chunks, published ? null : "슬랙 게시 실패");
        return new DispatchResult(status, report.getId(), null);
    }

    /**
     * 발송과 같은 과정을 저장·게시 직전까지만 밟는다: 수집 → 작성. DB에 남기지도, 슬랙에 보내지도 않는다.
     *
     * <p>수집된 게 하나도 없으면 AI를 호출하지 않고 바로 돌아온다 — 라벨·브랜치 오작동을 공짜로 잡아내는
     * 기존 미리보기의 성질을 그대로 유지한다.
     */
    public RenderResult renderPreview(Board board, BoardReportConfig config, ReportType reportType,
                                      ZonedDateTime sendAt) {
        ReportPeriod period = reportType == ReportType.WEEKLY_INTEGRATED
                ? ReportPeriod.weekly(sendAt)
                : ReportPeriod.daily(sendAt);

        Collected collected = collectForReport(board.getId(), config, reportType, period, sendAt);
        List<SourceChunk> chunks = collected.chunks();

        if (chunks.stream().noneMatch(SourceChunk::hasData)) {
            return new RenderResult(null, chunks, null, period, false);
        }

        ReportComposer.Composed composed = composer.compose(board.getId(), reportType,
                config.getLanguage(), period, chunks, collected.digests());
        return new RenderResult(composed.content(), chunks, composed.mergedInput(), period, true);
    }

    /** 수집 결과 묶음 — 소스 재료와, 주간 서술에 참고로 넣을 일일 요약. */
    private record Collected(List<SourceChunk> chunks,
                            List<WeeklyRollupCollector.DailyDigest> digests) {
    }

    /**
     * 보고서 재료 수집. 일일·수동은 원본에서 그 구간을 직접 긁고, 주간은 그 주 일일 보고서를 재활용해
     * 합친다(빠진 날만 원본 보충). 어느 쪽이든 켜진 소스만 대상으로 하고, 실패는 값으로 받는다.
     */
    private Collected collectForReport(String boardId, BoardReportConfig config,
                                       ReportType reportType, ReportPeriod period,
                                       ZonedDateTime sendAt) {
        List<ReportSource> enabled = sources.stream()
                .filter(source -> isEnabled(source, config))
                .toList();
        if (reportType == ReportType.WEEKLY_INTEGRATED) {
            WeeklyRollupCollector.RollupResult result =
                    weeklyRollupCollector.collect(boardId, sendAt, period, enabled);
            return new Collected(result.chunks(), result.digests());
        }
        return new Collected(collectAll(boardId, enabled, period), List.of());
    }

    private List<SourceChunk> collectAll(String boardId, List<ReportSource> enabled, ReportPeriod period) {
        List<SourceChunk> chunks = new ArrayList<>();
        for (ReportSource source : enabled) {
            try {
                chunks.add(source.collect(boardId, period));
            } catch (Exception e) {
                log.warn("소스 수집 중 예외 board={} source={}: {}", boardId, source.kind(), e.getMessage());
                chunks.add(SourceChunk.failed(source.kind(), e.getMessage()));
            }
        }
        return chunks;
    }

    private boolean isEnabled(ReportSource source, BoardReportConfig config) {
        return switch (source.kind()) {
            case GITHUB -> Boolean.TRUE.equals(config.getSourceGithubEnabled());
            case KANBAN -> Boolean.TRUE.equals(config.getSourceKanbanEnabled());
            case CONFLUENCE -> Boolean.TRUE.equals(config.getSourceConfluenceEnabled());
            case SLACK -> Boolean.TRUE.equals(config.getSourceSlackEnabled());
        };
    }

    private boolean publishWithRetry(Board board, BoardReportConfig config, ReportType reportType,
                                     ReportContent content, ReportPeriod period, String shareToken) {
        if (slackPublisher.publish(board, config, reportType, content, period, shareToken)) {
            return true;
        }
        log.info("슬랙 게시 1차 실패 — 재시도합니다 board={}", board.getId());
        return slackPublisher.publish(board, config, reportType, content, period, shareToken);
    }

    /** 보드 타임존에서 본 발송 시각 */
    public static ZonedDateTime sendAtIn(BoardReportConfig config, LocalDateTime nowUtc) {
        return nowUtc.atZone(ZoneOffset.UTC).withZoneSameInstant(ZoneId.of(config.getTimezone()));
    }
}
