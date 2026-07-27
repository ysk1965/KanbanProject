package com.kanban.domain.report.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.BoardReportConfigRepository;
import com.kanban.domain.report.ReportDeliveryStatus;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.dto.ReportConfigDto;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;

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
    private final ReportSlackPublisher slackPublisher;
    private final ReportModelCatalog modelCatalog;

    /**
     * 발송 테스트 결과. success=true면 <b>모든</b> 대상 채널에 게시가 성공해 자동 예약 잠금이 풀린다.
     * 채널별 성패는 {@code results}에 담긴다.
     */
    public record TestDispatchResult(boolean success, String channelId, String channelName,
                                     String message,
                                     List<ReportSlackPublisher.ChannelTestResult> results) {}

    @Transactional
    public ReportConfigDto.Detail get(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return toDetail(getOrCreate(boardId));
    }

    /** 응답 조립 — 저장된 값 위에 화면이 필요로 하는 목록(모델·발송 채널)을 얹는다. */
    private ReportConfigDto.Detail toDetail(BoardReportConfig config) {
        ReportConfigDto.Detail detail = ReportConfigDto.Detail.from(config);
        detail.setAvailableModels(modelCatalog.available());
        detail.setAiModelDefault(modelCatalog.defaultModelId());
        detail.setDeliveryChannels(resolveChannelEntries(config));
        return detail;
    }

    /**
     * 실제 발송 대상과 각 채널의 테스트 통과 여부. 지정된 채널이 없으면 설치 기본 채널 한 줄을
     * {@code isDefault=true}로 돌려준다 — 화면이 "미지정 = 기본 채널"을 그대로 보여줄 수 있게.
     */
    private List<ReportConfigDto.ChannelEntry> resolveChannelEntries(BoardReportConfig config) {
        return slackPublisher.resolveTargets(config.getBoard(), config).stream()
                .map(target -> new ReportConfigDto.ChannelEntry(
                        target.channelId(),
                        target.channelName(),
                        target.isDefault(),
                        target.isDefault()
                                ? target.channelId().equals(config.getTestPassedChannelId())
                                : config.findChannel(target.channelId())
                                        .map(ch -> ch.isTestPassed()).orElse(false)))
                .toList();
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

        // 목록이 함께 오면 그쪽이 이긴다 — 단일 채널 필드는 구버전 호환 경로다.
        if (request.getDeliveryChannels() != null) {
            config.replaceDeliveryChannels(request.getDeliveryChannels().stream()
                    .map(in -> new BoardReportConfig.ChannelRef(in.getChannelId(), in.getChannelName()))
                    .toList());
        }

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
                request.getSourceConfluenceEnabled(), request.getSourceSlackEnabled());
        config.updateSlackSource(request.getSourceSlackChannelId(), request.getSourceSlackChannelName());
        config.updateShareLink(request.getShareLinkEnabled());
        config.updateAiModel(validateAiModel(request.getAiModel()));

        return toDetail(config);
    }

    /**
     * 발송 채널 한 개 추가. 목록 전체를 다시 보내지 않아도 되게 별도 창구를 둔다 —
     * 화면에서 채널을 고르는 즉시 저장되고, 기존 채널의 테스트 통과 기록은 건드리지 않는다.
     */
    @Transactional
    public ReportConfigDto.Detail addChannel(String boardId, String userId,
                                             String channelId, String channelName) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (channelId == null || channelId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "채널 id가 필요합니다");
        }
        BoardReportConfig config = getOrCreate(boardId);
        if (config.findChannel(channelId).isEmpty()
                && config.getDeliveryChannels().size() >= BoardReportConfig.MAX_DELIVERY_CHANNELS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE,
                    "발송 채널은 최대 " + BoardReportConfig.MAX_DELIVERY_CHANNELS + "개까지 지정할 수 있습니다");
        }
        config.addDeliveryChannel(channelId.trim(), channelName);
        return toDetail(config);
    }

    /** 발송 채널 한 개 제거. 마지막 채널을 지우면 설치 기본 채널로 되돌아간다. */
    @Transactional
    public ReportConfigDto.Detail removeChannel(String boardId, String userId, String channelId) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);
        config.removeDeliveryChannel(channelId);
        return toDetail(config);
    }

    /**
     * 요청된 모델 값을 저장 전에 검증한다. null(미지정)·빈 문자열(기본으로 초기화)은 그대로 통과시켜
     * 엔티티의 부분 업데이트 규칙에 맡기고, 구체적인 id는 반드시 활성 프로바이더 목록에 있어야 한다 —
     * 잘못된/다른 프로바이더 모델을 저장하면 발송 시 AI 호출이 통째로 실패한다.
     */
    private String validateAiModel(String requested) {
        if (requested == null || requested.isBlank()) {
            return requested;
        }
        if (!modelCatalog.isAllowed(requested)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "지원하지 않는 AI 모델입니다: " + requested);
        }
        return requested;
    }

    /**
     * 스케줄과 무관하게 지금 한 번 보낸다. 설정을 마친 뒤 "정말 이렇게 나가는지" 확인하는 용도.
     *
     * <p>"기간 내 활동 없음"({@link ReportDeliveryStatus#SKIPPED})은 <b>정상 결과</b>다 —
     * 예외로 올리면 프론트가 서버 장애로 오인한다. 그대로 돌려주고, 발송본이 하나도
     * 남지 않은 진짜 실패({@code reportId == null})만 예외로 처리한다.
     */
    @Transactional
    public ReportDispatchService.DispatchResult dispatchNow(String boardId, String userId, ReportType reportType) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);
        Board board = config.getBoard();

        ZonedDateTime sendAt = ZonedDateTime.now(parseZone(config.getTimezone()));
        ReportDispatchService.DispatchResult result =
                dispatchService.dispatch(board, config, reportType, sendAt);

        if (result.status() == ReportDeliveryStatus.SKIPPED) {
            return result;
        }
        if (result.reportId() == null) {
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED,
                    result.message() != null ? result.message() : "보고서를 만들지 못했습니다");
        }
        // 실제로 게시된 채널만 "테스트 통과"로 기록한다 — 즉시 발송도 게이트를 만족시킨다.
        // 게시에 실패한 채널은 미통과로 남아 다시 테스트해야 예약이 열린다.
        result.sentChannelIds().forEach(config::markTestPassed);
        return result;
    }

    /**
     * 자동 예약을 켜기 전 채널·권한을 검증하는 발송 테스트. 확인 메시지 한 장을 대상 채널마다 게시하고,
     * 성공한 채널만 "테스트 통과"로 기록한다. 채널을 새로 추가하면 그 채널이 미통과 상태라 예약이 다시 잠긴다.
     *
     * @param channelId 지정하면 그 채널만 다시 테스트한다. null이면 전체.
     */
    @Transactional
    public TestDispatchResult sendTest(String boardId, String userId, String channelId) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);
        Board board = config.getBoard();

        ReportSlackPublisher.TestOutcome outcome =
                slackPublisher.sendTestMessage(board, config, channelId);
        outcome.results().stream()
                .filter(ReportSlackPublisher.ChannelTestResult::sent)
                .forEach(r -> config.markTestPassed(r.channelId()));

        ReportSlackPublisher.ChannelTestResult first =
                outcome.results().isEmpty() ? null : outcome.results().get(0);
        return new TestDispatchResult(outcome.sent(),
                first != null ? first.channelId() : null,
                first != null ? first.channelName() : null,
                outcome.error(), outcome.results());
    }

    /**
     * 지금 발송하면 나올 보고서를 <b>실제로 만들어서</b> 보여준다 — 저장도, 슬랙 게시도 하지 않는다.
     * 발송({@link #dispatchNow})과 같은 수집·AI 작성을 거치되 결과를 화면에만 돌려준다.
     *
     * <p>수집된 데이터가 없으면 AI를 태우지 않고 빈 본문으로 돌아온다(소스 상태만 채워서).
     */
    @Transactional
    public AutoReportResponse renderPreview(String boardId, String userId, ReportType reportType) {
        boardService.checkAdminOrAbove(boardId, userId);
        BoardReportConfig config = getOrCreate(boardId);
        Board board = config.getBoard();

        ZonedDateTime sendAt = ZonedDateTime.now(parseZone(config.getTimezone()));
        ReportDispatchService.RenderResult result =
                dispatchService.renderPreview(board, config, reportType, sendAt);

        return AutoReportResponse.preview(board.getId(), board.getName(), reportType,
                result.period(), result.content(), result.chunks(), result.mergedInput());
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
