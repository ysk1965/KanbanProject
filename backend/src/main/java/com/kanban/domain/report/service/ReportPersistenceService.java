package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.report.*;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.SourceChunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * 보고서 저장과 발송 기록.
 *
 * <p>별도 빈인 이유는 트랜잭션 때문이다. 수집·AI 호출은 수십 초가 걸릴 수 있어 그 구간을
 * 트랜잭션 밖에 두고, DB 쓰기만 여기서 짧게 끝낸다. (같은 빈 안에서 부르면 프록시를 안 거쳐
 * {@code @Transactional}이 걸리지 않는다)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportPersistenceService {

    /** 공유 링크 기본 수명 */
    private static final int SHARE_LINK_DAYS = 90;

    private final ReportRepository reportRepository;
    private final ReportDeliveryLogRepository deliveryLogRepository;
    private final BoardReportConfigRepository configRepository;
    private final ObjectMapper objectMapper;

    /**
     * 보고서 저장. <b>독립 트랜잭션(REQUIRES_NEW)으로 즉시 커밋</b>한다.
     *
     * <p>수동 발송(dispatchNow)은 바깥이 {@code @Transactional}이라, 여기서 REQUIRED로
     * 저장하면 보고서가 바깥 트랜잭션에 묶인 채 커밋 전 상태로 남는다. 그러면 뒤이어
     * REQUIRES_NEW로 도는 {@link #recordLog}가 아직 저장 안 된(=transient) 보고서를 참조해
     * {@code TransientObjectException}으로 터지고, 그 여파로 바깥 트랜잭션이 통째로 롤백돼
     * 슬랙에는 공유 버튼이 나갔는데 정작 보고서는 사라지는 사고가 난다.
     * 여기서 먼저 커밋해 두면 recordLog는 실제 행을 참조하고, 슬랙 게시 전에 보고서가
     * 확정되어 공유 링크가 항상 유효하다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public WeeklyReport save(Board board, ReportType reportType, ReportPeriod period,
                             ReportContent content, String contentJson, String mergedInput,
                             List<SourceChunk> chunks, String shareToken) {
        LocalDateTime expiresAt = shareToken != null
                ? LocalDateTime.now(ZoneOffset.UTC).plusDays(SHARE_LINK_DAYS)
                : null;

        WeeklyReport report = WeeklyReport.auto(
                board, reportType, period.startDate(), period.endDate(),
                toMarkdown(content), contentJson, mergedInput,
                writeSourceStatus(chunks), shareToken, expiresAt);
        return reportRepository.save(report);
    }

    /**
     * 발송 결과 기록. 보고서 생성이 실패해 롤백되는 상황에서도 <b>기록만은 남아야</b> 하므로
     * 독립 트랜잭션으로 커밋한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLog(Board board, WeeklyReport report, ReportType reportType,
                          ReportDeliveryStatus status, String channelId,
                          List<SourceChunk> chunks, String error) {
        try {
            deliveryLogRepository.save(ReportDeliveryLog.builder()
                    .board(board)
                    .report(report)
                    .reportType(reportType)
                    .status(status)
                    .slackChannelId(channelId)
                    .sourceStatusJson(writeSourceStatus(chunks))
                    .errorMessage(error)
                    .attemptCount(1)
                    .build());
        } catch (Exception e) {
            log.warn("발송 로그 기록 실패 board={}: {}", board.getId(), e.getMessage());
        }
    }

    @Transactional
    public void markSent(String boardId, ReportType reportType, LocalDateTime sentAtUtc) {
        configRepository.findByBoardId(boardId).ifPresent(config -> {
            if (reportType == ReportType.WEEKLY_INTEGRATED) {
                config.markWeeklySent(sentAtUtc);
            } else {
                config.markDailySent(sentAtUtc);
            }
        });
    }

    /** 기존 보고서 화면(마크다운 렌더)과의 호환을 위해 본문도 함께 만들어 둔다. */
    private String toMarkdown(ReportContent content) {
        StringBuilder sb = new StringBuilder();
        if (content.getLede() != null) {
            sb.append(content.getLede()).append("\n\n");
        }
        if (content.getHighlights() != null && !content.getHighlights().isEmpty()) {
            content.getHighlights().forEach(h -> sb.append("- ").append(h).append('\n'));
            sb.append('\n');
        }
        if (content.getSections() != null) {
            for (ReportContent.Section section : content.getSections()) {
                sb.append("## ").append(section.getTitle()).append("\n\n")
                        .append(section.getBody() != null ? section.getBody() : "").append("\n\n");
            }
        }
        if (content.getRisks() != null && !content.getRisks().isEmpty()) {
            sb.append("## 확인 필요\n\n");
            content.getRisks().forEach(r -> sb.append("- ").append(r).append('\n'));
        }
        return sb.toString().trim();
    }

    private String writeSourceStatus(List<SourceChunk> chunks) {
        List<Map<String, Object>> items = chunks.stream()
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("source", c.kind().name());
                    m.put("success", c.success());
                    m.put("has_data", c.hasData());
                    if (c.summary() != null) m.put("summary", c.summary());
                    if (c.errorMessage() != null) m.put("error", c.errorMessage());
                    return m;
                })
                .toList();
        try {
            return objectMapper.writeValueAsString(items);
        } catch (Exception e) {
            return null;
        }
    }
}
