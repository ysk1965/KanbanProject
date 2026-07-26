package com.kanban.domain.integration.slack.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.report.service.ReportMemberDirectory;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import com.kanban.domain.report.source.SourceKind;
import com.kanban.domain.storage.service.StorageService;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 지정된 슬랙 채널의 그 구간 대화를 읽어 보고서 재료로 넘긴다.
 *
 * <p>커밋·태스크에 안 남는 <b>논의·결정·막힌 지점</b>이 채널에는 남는다. 이걸 근거로 끌어와
 * "무엇이 왜 그렇게 됐는지"를 보고서가 설명할 수 있게 한다. 발송 채널과 별개의 채널을 읽으며,
 * 읽으려면 봇 토큰에 {@code channels:history}(+{@code groups:history}), 파일까지 보려면
 * {@code files:read} 스코프와 <b>봇의 채널 초대</b>가 필요하다.
 *
 * <p>넘기는 것: 발화(실명 해석) · 리액션 · <b>스레드 답글 본문</b> · 공유된 <b>이미지/영상</b>.
 * 결정은 대개 스레드 안에서 나므로 부모 글만 봐선 결론을 놓친다. 원문은 요약하지 않고 그대로 넘긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SlackChannelSource implements ReportSource {

    /** 한 번에 넘길 상위 메시지 상한 — 채널이 시끄러워도 프롬프트가 넘치지 않게 자른다. */
    private static final int MAX_MESSAGES = 200;
    private static final int PAGE_LIMIT = 200;
    /** 답글을 펼칠 스레드 수 상한 (API 폭주 방지) */
    private static final int MAX_THREADS = 12;
    private static final int MAX_REPLIES_PER_THREAD = 20;
    /** 보고서당 옮길 이미지/영상 개수 상한(사실상 무제한)과 파일당 크기 상한 */
    private static final int MAX_FILES = Integer.MAX_VALUE;
    private static final long MAX_FILE_BYTES = 300L * 1024 * 1024;

    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    private final SlackReportTargetResolver targetResolver;
    private final SlackApiClient apiClient;
    private final ReportMemberDirectory memberDirectory;
    private final FileUploadService fileUploadService;
    private final StorageService storageService;
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
    public boolean supportsWeeklyRollup() {
        return true;
    }

    /**
     * 일일 채널 수집분을 주간 한 벌로 이어붙인다. 일일 구간은 겹치지 않으므로(같은 기준 시각) 메시지가
     * 두 번 실릴 일은 없어 별도 중복 제거 없이 잇는다. 최신 조각이 먼저 오므로 그 순서를 살리고,
     * 프롬프트가 넘치지 않게 {@link #MAX_MESSAGES}까지만 남긴다. 첨부 이미지는 이미 우리 스토리지로
     * 옮겨진 URL이라 그대로 재사용된다.
     */
    @Override
    @SuppressWarnings("unchecked")
    public SourceChunk rollup(List<JsonNode> dailyData, ReportPeriod period) {
        String channelId = null;
        String channelName = null;
        List<Map<String, Object>> messages = new ArrayList<>();
        Set<String> participants = new HashSet<>();

        for (JsonNode day : dailyData) {
            if (channelId == null && day.hasNonNull("channel")) {
                channelId = day.get("channel").asText();
            }
            if (channelName == null && day.hasNonNull("channel_name")) {
                channelName = day.get("channel_name").asText();
            }
            JsonNode msgs = day.get("messages");
            if (msgs == null || !msgs.isArray()) {
                continue;
            }
            for (JsonNode msg : msgs) {
                if (messages.size() >= MAX_MESSAGES) {
                    break;
                }
                messages.add(objectMapper.convertValue(msg, Map.class));
                if (msg.hasNonNull("user")) {
                    participants.add(msg.get("user").asText());
                }
            }
        }

        if (messages.isEmpty()) {
            return SourceChunk.empty(SourceKind.SLACK, "기간 내 채널 메시지 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("messages", messages.size());
        metrics.put("participants", participants.size());
        String summary = "슬랙 메시지 " + messages.size() + "건 · 참여자 " + participants.size() + "명";
        return SourceChunk.ok(SourceKind.SLACK, rollupJson(channelId, channelName, messages),
                metrics, summary);
    }

    private String rollupJson(String channelId, String channelName, List<Map<String, Object>> messages) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("channel", channelId);
        root.put("channel_name", channelName);
        root.put("message_count", messages.size());
        root.put("messages", messages);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.error("슬랙 채널 롤업 JSON 직렬화 실패: {}", e.getMessage());
            return null;
        }
    }

    @Override
    public SourceChunk collect(String boardId, ReportPeriod period) {
        SlackReportTargetResolver.CollectionPlan plan = targetResolver.resolve(boardId).orElse(null);
        if (plan == null) {
            return SourceChunk.notConnected(SourceKind.SLACK);
        }

        long oldest = period.startInclusive().toInstant().getEpochSecond();
        long latest = period.endExclusive().toInstant().getEpochSecond();
        ZoneId zone = period.zone();

        List<Map<String, Object>> rawMessages;
        try {
            rawMessages = fetchRawMessages(plan, oldest, latest);
        } catch (Exception e) {
            // missing_scope(재승인 필요)·not_in_channel(봇 초대 필요)이 여기로 온다. 실패를 값으로 남긴다.
            log.warn("슬랙 채널 수집 실패 board={} channel={}: {}", boardId, plan.channelId(), e.getMessage());
            return SourceChunk.failed(SourceKind.SLACK,
                    "채널 읽기 실패 — 봇 스코프(채널 히스토리)와 채널 초대를 확인하세요");
        }

        if (rawMessages.isEmpty()) {
            return SourceChunk.empty(SourceKind.SLACK, "기간 내 채널 메시지 없음");
        }

        // 스레드 답글을 먼저 당겨온다 — 이름 해석 대상(작성자)에 답글 작성자도 포함해야 한다.
        Map<String, List<Map<String, Object>>> repliesByParent = fetchThreads(plan, rawMessages);

        Set<String> userIds = new HashSet<>();
        collectUserIds(rawMessages, userIds);
        repliesByParent.values().forEach(replies -> collectUserIds(replies, userIds));
        Map<String, String> nameMap = memberDirectory.slackNameMap(userIds);

        int[] fileBudget = {MAX_FILES};
        List<Map<String, Object>> messages = new ArrayList<>();
        Set<String> participants = new HashSet<>();

        for (Map<String, Object> raw : rawMessages) {
            Map<String, Object> item = toItem(raw, zone, nameMap, plan, fileBudget, boardId);
            if (item == null) {
                continue;
            }
            Object user = raw.get("user");
            if (user != null) {
                participants.add(String.valueOf(user));
            }
            List<Map<String, Object>> replies = repliesByParent.get(String.valueOf(raw.get("ts")));
            if (replies != null && !replies.isEmpty()) {
                List<Map<String, Object>> replyItems = new ArrayList<>();
                for (Map<String, Object> reply : replies) {
                    Map<String, Object> replyItem = toItem(reply, zone, nameMap, plan, fileBudget, boardId);
                    if (replyItem != null) {
                        replyItems.add(replyItem);
                    }
                }
                if (!replyItems.isEmpty()) {
                    item.put("replies", replyItems);
                }
            }
            messages.add(item);
        }

        if (messages.isEmpty()) {
            return SourceChunk.empty(SourceKind.SLACK, "기간 내 채널 메시지 없음");
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("messages", messages.size());
        metrics.put("participants", participants.size());

        String summary = "슬랙 메시지 " + messages.size() + "건 · 참여자 " + participants.size() + "명";
        return SourceChunk.ok(SourceKind.SLACK, toJson(plan, messages), metrics, summary);
    }

    // ── 수집 ────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchRawMessages(SlackReportTargetResolver.CollectionPlan plan,
                                                       long oldest, long latest) {
        List<Map<String, Object>> collected = new ArrayList<>();
        String cursor = null;
        do {
            Map<String, Object> response = apiClient.conversationsHistory(
                    plan.botToken(), plan.channelId(), oldest, latest, cursor, PAGE_LIMIT);
            List<Map<String, Object>> raw = (List<Map<String, Object>>) response.get("messages");
            if (raw != null) {
                for (Map<String, Object> msg : raw) {
                    if (isHumanMessage(msg)) {
                        collected.add(msg);
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

    /** reply_count가 있는 상위 메시지의 스레드를 펼쳐 답글(부모 제외)을 당겨온다. */
    @SuppressWarnings("unchecked")
    private Map<String, List<Map<String, Object>>> fetchThreads(SlackReportTargetResolver.CollectionPlan plan,
                                                                List<Map<String, Object>> rawMessages) {
        Map<String, List<Map<String, Object>>> byParent = new HashMap<>();
        int expanded = 0;
        for (Map<String, Object> msg : rawMessages) {
            if (expanded >= MAX_THREADS) {
                break;
            }
            Object replyCount = msg.get("reply_count");
            String ts = String.valueOf(msg.get("ts"));
            if (replyCount == null || ((Number) replyCount).intValue() <= 0) {
                continue;
            }
            try {
                Map<String, Object> response = apiClient.conversationsReplies(
                        plan.botToken(), plan.channelId(), ts, MAX_REPLIES_PER_THREAD);
                List<Map<String, Object>> all = (List<Map<String, Object>>) response.get("messages");
                if (all == null) {
                    continue;
                }
                List<Map<String, Object>> replies = new ArrayList<>();
                for (Map<String, Object> m : all) {
                    // 첫 항목은 부모 글 — 이미 상위 목록에 있으니 건너뛴다.
                    if (ts.equals(String.valueOf(m.get("ts")))) {
                        continue;
                    }
                    if (isHumanMessage(m)) {
                        replies.add(m);
                    }
                }
                if (!replies.isEmpty()) {
                    byParent.put(ts, replies);
                }
                expanded++;
            } catch (Exception e) {
                log.debug("스레드 답글 조회 실패 ts={}: {}", ts, e.getMessage());
            }
        }
        return byParent;
    }

    // ── 변환 ────────────────────────────────────────

    /** 사람이 쓴 실제 발화만 남긴다 — 봇 메시지·시스템 메시지·(글도 파일도 없는) 빈 글은 버린다. */
    private boolean isHumanMessage(Map<String, Object> msg) {
        if (msg.get("bot_id") != null || msg.get("subtype") != null || msg.get("user") == null) {
            return false;
        }
        Object text = msg.get("text");
        boolean hasText = text != null && !String.valueOf(text).isBlank();
        boolean hasFiles = msg.get("files") instanceof List<?> files && !files.isEmpty();
        return hasText || hasFiles;
    }

    private void collectUserIds(List<Map<String, Object>> messages, Set<String> into) {
        for (Map<String, Object> msg : messages) {
            Object user = msg.get("user");
            if (user != null) {
                into.add(String.valueOf(user));
            }
        }
    }

    private Map<String, Object> toItem(Map<String, Object> msg, ZoneId zone, Map<String, String> nameMap,
                                       SlackReportTargetResolver.CollectionPlan plan, int[] fileBudget, String boardId) {
        Object user = msg.get("user");
        if (user == null) {
            return null;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        String userId = String.valueOf(user);
        item.put("user", userId);
        String name = nameMap.get(userId);
        if (name != null) {
            item.put("author", name);   // BRIDGE에 슬랙 계정을 연동한 사람만 해석됨
        }
        item.put("at", formatTs(msg.get("ts"), zone));

        Object text = msg.get("text");
        if (text != null && !String.valueOf(text).isBlank()) {
            item.put("text", String.valueOf(text));
        }

        List<String> reactions = extractReactions(msg);
        if (!reactions.isEmpty()) {
            item.put("reactions", reactions);
        }

        List<Map<String, Object>> files = extractFiles(msg, plan, fileBudget, boardId);
        if (!files.isEmpty()) {
            item.put("files", files);
        }
        return item;
    }

    private String formatTs(Object ts, ZoneId zone) {
        if (ts == null) {
            return null;
        }
        try {
            long epoch = (long) Double.parseDouble(String.valueOf(ts));
            return Instant.ofEpochSecond(epoch).atZone(zone).format(AT);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> extractReactions(Map<String, Object> msg) {
        Object raw = msg.get("reactions");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<String> reactions = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> r) {
                Object name = ((Map<String, Object>) r).get("name");
                Object count = ((Map<String, Object>) r).get("count");
                if (name != null) {
                    reactions.add(count != null ? name + " " + count : String.valueOf(name));
                }
            }
        }
        return reactions;
    }

    /**
     * 메시지의 이미지/영상 첨부를 갤러리 아이템으로 만든다.
     *
     * <p><b>이미지</b>는 우리 스토리지로 옮겨 CDN URL을 넣는다 — url_private는 봇 인증이 필요해
     * 로그인 없이 열리는 보고서에 바로 못 박기 때문이다.
     *
     * <p><b>영상</b>은 용량 부담이 커서 원본을 옮기지 않는다. 포스터 썸네일(작은 JPEG)만 옮겨
     * 미리보기를 보여주고, 재생은 슬랙 원문(permalink)으로 넘긴다.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractFiles(Map<String, Object> msg,
                                                   SlackReportTargetResolver.CollectionPlan plan, int[] fileBudget,
                                                   String boardId) {
        Object raw = msg.get("files");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (Object o : list) {
            if (fileBudget[0] <= 0 || !(o instanceof Map<?, ?> f)) {
                break;
            }
            Map<String, Object> file = (Map<String, Object>) f;
            String type = mediaType(str(file.get("mimetype")));
            if (type == null) {
                continue;   // 이미지·영상만 다룬다
            }
            try {
                Map<String, Object> item = "video".equals(type)
                        ? toVideoItem(file, plan, boardId)
                        : toImageItem(file, plan, boardId);
                if (item == null) {
                    continue;
                }
                results.add(item);
                fileBudget[0]--;
            } catch (Exception e) {
                log.debug("슬랙 파일 이관 실패 file={}: {}", file.get("id"), e.getMessage());
            }
        }
        return results;
    }

    /** 이미지를 압축해 우리 스토리지로 옮기고 갤러리 아이템을 만든다. 너무 크거나 URL이 없으면 null. */
    private Map<String, Object> toImageItem(Map<String, Object> file,
                                            SlackReportTargetResolver.CollectionPlan plan, String boardId) {
        Object size = file.get("size");
        if (size instanceof Number n && n.longValue() > MAX_FILE_BYTES) {
            return null;
        }
        String urlPrivate = privateUrl(file);
        if (urlPrivate == null) {
            return null;
        }
        String mimetype = str(file.get("mimetype"));
        SlackApiClient.FileContent content = apiClient.downloadFile(plan.botToken(), urlPrivate);
        byte[] bytes = content.bytes();
        String storeMime = mimetype;                        // S3 키 확장자 기준
        String uploadContentType = content.contentType();   // 업로드 컨텐츠 타입
        // 이미지 압축: 최대 1600px, JPEG 품질 0.8 (투명 PNG·GIF·WebP는 원본 유지)
        MediaUtils.ProcessedImage processed = MediaUtils.compressImage(bytes, mimetype, 1600, 0.8);
        if (processed.changed()) {
            bytes = processed.bytes();
            storeMime = processed.contentType();
            uploadContentType = processed.contentType();
        }
        String key = storageKey(plan.channelId(), str(file.get("id")), storeMime);
        String url = fileUploadService.uploadDirect(bytes, key, uploadContentType);
        String displayName = displayName(file);
        registerReportFile(boardId, key, displayName, uploadContentType, bytes.length);

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("title", displayName);
        item.put("type", "image");
        item.put("url", url);
        return item;
    }

    /**
     * 영상 포스터 썸네일만 옮기고, 재생 링크(슬랙 permalink)를 넣은 갤러리 아이템을 만든다.
     * 썸네일도 링크도 없으면(보여줄·이동할 것이 없으면) null.
     */
    private Map<String, Object> toVideoItem(Map<String, Object> file,
                                            SlackReportTargetResolver.CollectionPlan plan, String boardId) {
        String displayName = displayName(file);
        String link = str(file.get("permalink"));   // 슬랙 원문 — 클릭 시 이동해 재생
        String posterUrl = null;

        String thumb = videoThumbUrl(file);
        if (thumb != null) {
            try {
                SlackApiClient.FileContent content = apiClient.downloadFile(plan.botToken(), thumb);
                byte[] bytes = content.bytes();
                String key = storageKey(plan.channelId(), str(file.get("id")) + "_poster", content.contentType());
                posterUrl = fileUploadService.uploadDirect(bytes, key, content.contentType());
                registerReportFile(boardId, key, displayName, content.contentType(), bytes.length);
            } catch (Exception e) {
                log.debug("슬랙 영상 썸네일 이관 실패 file={}: {}", file.get("id"), e.getMessage());
            }
        }

        if (posterUrl == null && link == null) {
            return null;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("title", displayName);
        item.put("type", "video");
        if (posterUrl != null) {
            item.put("url", posterUrl);
        }
        if (link != null) {
            item.put("link", link);
        }
        return item;
    }

    private String privateUrl(Map<String, Object> file) {
        String url = str(file.get("url_private_download"));
        return url != null ? url : str(file.get("url_private"));
    }

    private String displayName(Map<String, Object> file) {
        String title = str(file.get("title"));
        return title != null ? title : str(file.get("name"));
    }

    /**
     * 영상 포스터로 쓸 JPEG 썸네일 URL을 고른다. 없으면 null(포스터 없이 링크만).
     * {@code thumb_video}가 슬랙 영상 파일의 전용 포스터 필드라 우선하고,
     * 이미지형 썸네일({@code thumb_1024}…)은 그것이 없는 영상만 큰 것부터 대체한다.
     */
    private String videoThumbUrl(Map<String, Object> file) {
        for (String k : new String[]{"thumb_video", "thumb_1024", "thumb_960", "thumb_800", "thumb_720", "thumb_480", "thumb_360"}) {
            String url = str(file.get(k));
            if (url != null) {
                return url;
            }
        }
        return null;
    }

    /** 보드 스토리지("전체 파일")에도 노출 — 관리·용량 파악용. best-effort(실패해도 수집 계속). */
    private void registerReportFile(String boardId, String key, String name, String contentType, long size) {
        try {
            storageService.registerReportFile(boardId, key, name, contentType, size);
        } catch (Exception e) {
            log.debug("보고서 파일 스토리지 등록 실패 key={}: {}", key, e.getMessage());
        }
    }

    /** image/* → "image", video/* → "video", 그 외 → null(옮기지 않음) */
    private String mediaType(String mimetype) {
        if (mimetype == null) {
            return null;
        }
        if (mimetype.startsWith("image/")) {
            return "image";
        }
        if (mimetype.startsWith("video/")) {
            return "video";
        }
        return null;
    }

    /** 재실행 시 같은 파일은 같은 키로 덮어쓴다 — 매번 새 사본이 쌓이지 않게. */
    private String storageKey(String channelId, String fileId, String mimetype) {
        String ext = mimetype != null && mimetype.contains("/")
                ? mimetype.substring(mimetype.indexOf('/') + 1)
                : "bin";
        return "reports/slack/" + channelId + "/" + fileId + "." + ext;
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

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
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
