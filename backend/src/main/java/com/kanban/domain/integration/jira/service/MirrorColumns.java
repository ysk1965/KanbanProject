package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 미러 컬럼 정의 파서/리졸버. {@code JiraIntegrationConfig.mirrorColumnsJson}을 해석한다.
 * JIRA Agile 보드 컬럼(이름 + 묶인 상태들)을 BRIDGE 블록에 미러링한 결과.
 *
 * pull: {@link #blockForStatus} 로 이슈 상태 → 배치 블록.
 * push: {@link #statusIdsForBlock} 로 대상 블록 → 전환 후보 상태들(첫 유효 전환 실행).
 */
public final class MirrorColumns {

    public record Col(String blockId, String name, List<String> statusIds, String primary) {}

    private final List<Col> cols;

    private MirrorColumns(List<Col> cols) {
        this.cols = cols;
    }

    public static MirrorColumns parse(ObjectMapper mapper, String json) {
        if (json == null || json.isBlank()) return new MirrorColumns(List.of());
        try {
            List<Map<String, Object>> raw = mapper.readValue(json, new TypeReference<>() {});
            List<Col> parsed = new ArrayList<>();
            for (Map<String, Object> m : raw) {
                String blockId = str(m.get("block_id"));
                if (blockId == null) continue;
                List<String> statusIds = new ArrayList<>();
                Object sids = m.get("status_ids");
                if (sids instanceof List<?> list) {
                    for (Object o : list) if (o != null) statusIds.add(String.valueOf(o));
                }
                String primary = str(m.get("primary"));
                if (primary == null && !statusIds.isEmpty()) primary = statusIds.get(0);
                parsed.add(new Col(blockId, str(m.get("name")), statusIds, primary));
            }
            return new MirrorColumns(parsed);
        } catch (Exception e) {
            return new MirrorColumns(List.of());
        }
    }

    public boolean isEmpty() {
        return cols.isEmpty();
    }

    public List<Col> columns() {
        return cols;
    }

    /** 이 JIRA 상태가 속한 컬럼의 블록 id (없으면 null). */
    public String blockForStatus(String statusId) {
        if (statusId == null) return null;
        for (Col c : cols) {
            if (c.statusIds().contains(statusId)) return c.blockId();
        }
        return null;
    }

    /** 이 블록(컬럼)에 묶인 JIRA 상태 id들 (push 전환 후보, 우선순위 순). */
    public List<String> statusIdsForBlock(String blockId) {
        for (Col c : cols) {
            if (c.blockId().equals(blockId)) return c.statusIds();
        }
        return List.of();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
