package com.kanban.domain.integration.slack.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 지정된 슬랙 채널의 그 구간 대화를 읽어 보고서 재료로 넘긴다.
 *
 * <p>커밋·태스크에 안 남는 <b>논의·결정·막힌 지점</b>이 채널에는 남는다. 이걸 근거로 끌어와
 * "무엇이 왜 그렇게 됐는지"를 보고서가 설명할 수 있게 한다. 발송 채널과 별개의 채널을 읽으며,
 * 읽으려면 봇 토큰에 {@code channels:history}(+{@code groups:history}) 스코프와 <b>봇의 채널 초대</b>가 필요하다.
 *
 * <p>Confluence 원문과 마찬가지로 <b>요약하지 않고</b> 넘긴다 — 인용 여부는 프롬프트가 판단한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SlackChannelSource implements ReportSource {

    /** 한 번에 넘길 메시지 상한 — 채널이 시끄러워도 프롬프트가 넘치지 않게 자른다. */
    private static final int MAX_MESSAGES = 200;
    /** conversations.history 페이지 크기 */
    private static final int PAGE_LIMIT = 200;

    private final SlackReportTargetResolver targetResolver;
    private final SlackApiClient apiClient;
    private final ObjectMapper objectMapper;

    @Override
    public SourceKind kind() {
        return SourceKind.SLACK;
    }

    @Override
    public boolean isConfigured(String boardId) {
        return targetResolver.resolve(boardId).isPresent();
    }

    @Override
    public SourceChunk collect(String boardId, ReportPeriod period) {
        SlackReportTargetResolver.CollectionPlan plan = targetResolver.resolve(boardId).orElse(null);
        if (plan == null) {
            return SourceChunk.notConnected(SourceKind.SLACK);
        }

        long oldest = period.startInclusive().toInstant().getEpochSecond();
        long latest = period.endExclusive().toInstant().getEpochSecond();

        List<Map<String, Object>> messages;
        try {
            messages = fetchMessages(plan, oldest, latest);
        } catch (Exception e) {
            // missing_scope(재승인 필요)·not_in_channel(봇 초대 필요)이 여기로 온다. 실패를 값으로 남겨
            // "슬랙 수집 실패 — 연결 확인 필요"가 risks에 뜨게 한다.
            log.warn("슬랙 채널 수집 실패 board={} channel={}: {}", boardId, plan.channelId(), e.getMessage());
            return SourceChunk.failed(SourceKind.SLACK,
                    "채널 읽기 실패 — 봇 스코프(채널 히스토리)와 채널 초대를 확인하세요");
        }

        if (messages.isEmpty()) {
            return SourceChunk.empty(SourceKind.SLACK, "기간 내 채널 메시지 없음");
        }

        Set<String> participants = new HashSet<>();
        for (Map<String, Object> m : messages) {
            Object user = m.get("user");
            if (user != null) {
                participants.add(String.valueOf(user));
            }
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("messages", messages.size());
        metrics.put("participants", participants.size());

        String summary = "슬랙 메시지 " + messages.size() + "건 · 참여자 " + participants.size() + "명";
        return SourceChunk.ok(SourceKind.SLACK, toJson(plan, messages), metrics, summary);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchMessages(SlackReportTargetResolver.CollectionPlan plan,
                                                    long oldest, long latest) {
        List<Map<String, Object>> collected = new ArrayList<>();
        String cursor = null;

        do {
            Map<String, Object> response = apiClient.conversationsHistory(
                    plan.botToken(), plan.channelId(), oldest, latest, cursor, PAGE_LIMIT);

            List<Map<String, Object>> raw = (List<Map<String, Object>>) response.get("messages");
            if (raw != null) {
                for (Map<String, Object> msg : raw) {
                    Map<String, Object> item = toItem(msg);
                    if (item != null) {
                        collected.add(item);
                    }
                    if (collected.size() >= MAX_MESSAGES) {
                        return collected;
                    }
                }
            }

            cursor = nextCursor(response);
        } while (cursor != null);

        return collected;
    }

    /**
     * 사람이 쓴 실제 발화만 남긴다 — 봇 메시지(우리 보고서 게시물 포함)·채널 입장 같은 시스템 메시지·빈 글은 버린다.
     */
    private Map<String, Object> toItem(Map<String, Object> msg) {
        if (msg.get("bot_id") != null || msg.get("subtype") != null) {
            return null;
        }
        Object user = msg.get("user");
        Object text = msg.get("text");
        if (user == null || text == null || String.valueOf(text).isBlank()) {
            return null;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("user", String.valueOf(user));
        item.put("ts", msg.get("ts"));
        item.put("text", String.valueOf(text));
        // 스레드 부모면 답글 수를 함께 넘긴다 — 논의가 얼마나 이어졌는지 신호가 된다.
        Object replyCount = msg.get("reply_count");
        if (replyCount != null) {
            item.put("reply_count", replyCount);
        }
        return item;
    }

    @SuppressWarnings("unchecked")
    private String nextCursor(Map<String, Object> response) {
        Map<String, Object> meta = (Map<String, Object>) response.get("response_metadata");
        if (meta == null || meta.get("next_cursor") == null) {
            return null;
        }
        String cursor = String.valueOf(meta.get("next_cursor"));
        return cursor.isBlank() ? null : cursor;
    }

    private String toJson(SlackReportTargetResolver.CollectionPlan plan, List<Map<String, Object>> messages) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("channel", plan.channelId());
        root.put("channel_name", plan.channelName());
        root.put("message_count", messages.size());
        root.put("messages", messages);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("슬랙 채널 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }
}
