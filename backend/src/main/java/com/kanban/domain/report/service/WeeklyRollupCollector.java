package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.ReportSource;
import com.kanban.domain.report.source.SourceChunk;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 주간 보고서 재료를, 원본 API를 7일치 다시 긁는 대신 <b>그 주에 이미 발행된 일일 보고서를 재활용</b>해 모은다.
 *
 * <p>커밋·슬랙·Confluence처럼 누적형 소스는 일일 조각을 이어붙이면 그 주 전체가 된다
 * ({@link ReportSource#supportsWeeklyRollup()}). 칸반처럼 그 순간의 상태인 소스는 조각을 더한다는 게
 * 성립하지 않아 주간 기간으로 원본을 새로 수집한다.
 *
 * <p>일일이 없는 날(미설정·실패·스킵)은 그 <b>하루만</b> 원본에서 보충 수집해 채운다 — 그래서 롤업이
 * 일일 발송 여부에 종속되지 않는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WeeklyRollupCollector {

    private static final int WEEK_DAYS = 7;

    private final ReportRepository reportRepository;
    private final ObjectMapper objectMapper;

    /**
     * 주간 수집 결과.
     *
     * @param chunks  소스별 재료(누적형은 일일 롤업, 상태형은 주간 원본 수집)
     * @param digests 그 주에 이미 발행된 일일 보고서 요약들 — AI가 주간 서술의 <b>참고 컨텍스트</b>로
     *                쓴다(스토리 연속성·톤 일관성). 지표·본문의 근거는 어디까지나 {@code chunks}다.
     */
    public record RollupResult(List<SourceChunk> chunks, List<DailyDigest> digests) {
    }

    /** 하루치 일일 보고서의 핵심 요약. 원문이 아니라 헤드라인·하이라이트만 추린다. */
    public record DailyDigest(String date, String headline, List<String> highlights) {
    }

    /**
     * @param enabledSources 이 보드에서 켜진 소스만 (활성화 판단은 호출부 몫)
     * @param sendAt         주간 발송 시각(보드 로컬). 하루 슬롯 경계의 기준점.
     * @param weekPeriod     주간 전체 구간 — 칸반 원본 수집과 라벨에 쓴다.
     */
    public RollupResult collect(String boardId, ZonedDateTime sendAt,
                                ReportPeriod weekPeriod, List<ReportSource> enabledSources) {
        List<ReportPeriod> daySlots = daySlots(sendAt);       // 최신 하루가 먼저
        LocalDate from = daySlots.get(daySlots.size() - 1).startDate();  // 가장 오래된 슬롯
        LocalDate to = daySlots.get(0).startDate();                      // 가장 최근 슬롯

        List<WeeklyReport> dailies = reportRepository.findDailyReportsForRollup(boardId, from, to);
        Map<LocalDate, JsonNode> snapshotByDay = indexSnapshots(dailies);
        List<DailyDigest> digests = extractDigests(dailies);

        List<SourceChunk> chunks = new ArrayList<>();
        for (ReportSource source : enabledSources) {
            try {
                chunks.add(collectSource(source, boardId, weekPeriod, daySlots, snapshotByDay));
            } catch (Exception e) {
                log.warn("주간 롤업 수집 중 예외 board={} source={}: {}",
                        boardId, source.kind(), e.toString(), e);
                chunks.add(SourceChunk.failed(source.kind(), e.toString()));
            }
        }
        return new RollupResult(chunks, digests);
    }

    private SourceChunk collectSource(ReportSource source, String boardId, ReportPeriod weekPeriod,
                                      List<ReportPeriod> daySlots, Map<LocalDate, JsonNode> snapshotByDay) {
        // 상태 스냅샷형(칸반 등) — 주간 기간으로 원본을 새로 수집한다.
        if (!source.supportsWeeklyRollup()) {
            return source.collect(boardId, weekPeriod);
        }

        String key = source.kind().name().toLowerCase(Locale.ROOT);

        // 그 주에 이 소스의 일일 수집분이 하나도 없으면(일일 미설정 보드 등) 하루씩 7번 쪼개 부르는 건
        // 오히려 손해다 — 예전처럼 주간 한 구간으로 원본을 한 번에 수집한다.
        boolean anySnapshot = snapshotByDay.values().stream().anyMatch(s -> hasSource(s, key));
        if (!anySnapshot) {
            return source.collect(boardId, weekPeriod);
        }

        List<JsonNode> perDay = new ArrayList<>();
        // 보충 수집에서 새로 옮긴 파일. 롤업 청크에 실어 보내야 이 주간 보고서 폴더로 들어간다
        // (재사용한 날의 파일은 이미 그날 일일 보고서 폴더에 들어가 있다).
        List<String> gapFileKeys = new ArrayList<>();
        int reused = 0;
        int gapFilled = 0;

        for (ReportPeriod slot : daySlots) {
            JsonNode sub = sourceNode(snapshotByDay.get(slot.startDate()), key);
            if (sub != null) {
                perDay.add(sub);       // 그날 일일 보고서의 수집분 재사용 — API 호출 없음
                reused++;
            } else {
                SourceChunk day = source.collect(boardId, slot);   // 빠진 날만 원본 보충
                gapFileKeys.addAll(day.collectedFileKeys());
                if (day.hasData()) {
                    JsonNode parsed = readTree(day.dataJson());
                    if (parsed != null) {
                        perDay.add(parsed);
                    }
                }
                gapFilled++;
            }
        }

        log.debug("주간 롤업 board={} source={} 재사용={} 보충수집={}",
                boardId, source.kind(), reused, gapFilled);

        if (perDay.isEmpty()) {
            return SourceChunk.empty(source.kind(), "기간 내 활동 없음")
                    .withCollectedFileKeys(gapFileKeys);
        }
        return source.rollup(perDay, weekPeriod).withCollectedFileKeys(gapFileKeys);
    }

    private boolean hasSource(JsonNode snapshot, String key) {
        return sourceNode(snapshot, key) != null;
    }

    /** 일일 스냅샷 root에서 이 소스의 수집분을 꺼낸다. 없으면 null. */
    private JsonNode sourceNode(JsonNode snapshot, String key) {
        if (snapshot == null) {
            return null;
        }
        JsonNode sub = snapshot.get(key);
        return (sub != null && !sub.isNull() && !sub.isMissingNode()) ? sub : null;
    }

    /** 발송 시각에서 하루씩 되짚은 7개 구간. index 0이 가장 최근 하루. */
    private List<ReportPeriod> daySlots(ZonedDateTime sendAt) {
        List<ReportPeriod> slots = new ArrayList<>(WEEK_DAYS);
        for (int k = 1; k <= WEEK_DAYS; k++) {
            slots.add(new ReportPeriod(sendAt.minusDays(k), sendAt.minusDays(k - 1), sendAt.getZone()));
        }
        return slots;
    }

    /**
     * 일일 보고서를 하루(=수집 시작일) 단위로 색인한다. 같은 날 재생성본이 여러 개면 최신 한 벌만
     * 쓴다(쿼리가 최신 우선 정렬 → 먼저 들어온 것 유지).
     */
    private Map<LocalDate, JsonNode> indexSnapshots(List<WeeklyReport> dailies) {
        Map<LocalDate, JsonNode> byDay = new TreeMap<>();
        for (WeeklyReport daily : dailies) {
            if (byDay.containsKey(daily.getPeriodStart()) || daily.getDataSnapshot() == null) {
                continue;
            }
            JsonNode root = readTree(daily.getDataSnapshot());
            if (root != null) {
                byDay.put(daily.getPeriodStart(), root);
            }
        }
        return byDay;
    }

    /**
     * 일일 보고서의 헤드라인·하이라이트를 하루당 한 벌씩 추린다(최신 날짜 우선). 주간 AI가 서술을
     * 이어 쓰도록 넣는 참고용이라, 원문 본문·지표는 넣지 않고 요약만 담아 토큰을 아낀다.
     */
    private List<DailyDigest> extractDigests(List<WeeklyReport> dailies) {
        List<DailyDigest> digests = new ArrayList<>();
        Set<LocalDate> seen = new HashSet<>();
        for (WeeklyReport daily : dailies) {
            if (!seen.add(daily.getPeriodStart()) || daily.getContentJson() == null) {
                continue;
            }
            JsonNode content = readTree(daily.getContentJson());
            if (content == null) {
                continue;
            }
            String headline = content.hasNonNull("headline") ? content.get("headline").asText() : null;
            List<String> highlights = new ArrayList<>();
            JsonNode hl = content.get("highlights");
            if (hl != null && hl.isArray()) {
                hl.forEach(h -> {
                    if (h != null && !h.isNull()) {
                        highlights.add(h.asText());
                    }
                });
            }
            if (headline == null && highlights.isEmpty()) {
                continue;   // 담을 요약이 없다
            }
            String date = daily.getPeriodEnd() != null ? daily.getPeriodEnd().toString() : null;
            digests.add(new DailyDigest(date, headline, highlights));
        }
        return digests;
    }

    private JsonNode readTree(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.warn("일일 스냅샷 파싱 실패 — 그 조각은 건너뜁니다: {}", e.getMessage());
            return null;
        }
    }
}
