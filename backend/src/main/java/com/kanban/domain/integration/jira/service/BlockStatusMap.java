package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.task.QaState;

import java.util.Map;

/**
 * 블록 ↔ JIRA status 양방향 매핑 파서 + 해석기.
 *
 * <p>저장 JSON 형태 (key=blockId 또는 특수키):
 * <pre>
 * {
 *   "&lt;blockId&gt;":   { "jira_status_id":"10001", "dir":"push" },              // 개발 소유
 *   "&lt;reviewBId&gt;": { "jira_status_id":"10003", "dir":"pull", "qa":"REVIEW" }, // QA 검토중
 *   "&lt;doneBId&gt;":   { "jira_status_id":"10004", "dir":"pull", "qa":"VERIFIED"},// QA 완료
 *   "__rejected":    { "jira_status_id":"10005", "return_block_id":"&lt;blockId&gt;" } // 반려→복귀
 * }
 * </pre>
 *
 * <p>두 방향으로 조회한다:
 * <ul>
 *   <li><b>push</b> — 블록으로 카드가 이동하면 어떤 JIRA status로 전환할지 ({@link #pushTargetForBlock}).</li>
 *   <li><b>pull</b> — JIRA status가 바뀌면 카드를 어떤 블록으로/어떤 QA 상태로 반영할지 ({@link #pullFor}).</li>
 * </ul>
 * push는 개발이 소유(BRIDGE→JIRA), pull은 QA가 소유(JIRA→BRIDGE 읽기전용). 이 소유권 분리가 곧 에코 루프 방지다.
 */
public final class BlockStatusMap {

    public static final String REJECTED_KEY = "__rejected";

    private final Map<String, Map<String, String>> raw;

    private BlockStatusMap(Map<String, Map<String, String>> raw) {
        this.raw = raw;
    }

    public static BlockStatusMap parse(ObjectMapper mapper, String json) {
        if (json == null || json.isBlank()) return new BlockStatusMap(Map.of());
        try {
            Map<String, Map<String, String>> parsed =
                mapper.readValue(json, new TypeReference<Map<String, Map<String, String>>>() {});
            return new BlockStatusMap(parsed != null ? parsed : Map.of());
        } catch (Exception e) {
            return new BlockStatusMap(Map.of());
        }
    }

    public boolean isEmpty() {
        return raw.isEmpty();
    }

    // ── PUSH: 블록 → JIRA status ─────────────────────────

    /** 이 블록이 push 소유이고 대상 status가 있으면 그 statusId, 아니면 null. */
    public String pushTargetForBlock(String blockId) {
        Map<String, String> e = raw.get(blockId);
        if (e == null) return null;
        if (!"push".equalsIgnoreCase(e.getOrDefault("dir", "push"))) return null;
        String sid = e.get("jira_status_id");
        return (sid != null && !sid.isBlank()) ? sid : null;
    }

    // ── PULL: JIRA status → 블록 + QA 상태 ───────────────

    /** JIRA status 반영 대상. null이면 개발 소유/미매핑 → pull이 카드를 건드리지 않음. */
    public record PullTarget(String blockId, QaState qaState, boolean rejection) {}

    /**
     * 주어진 JIRA statusId가 pull(또는 반려) 대상인지 해석한다.
     * <ul>
     *   <li>__rejected.status와 일치 → 복귀 블록 + REJECTED</li>
     *   <li>dir=pull 블록의 status와 일치 → 그 블록 + qa(REVIEW/VERIFIED)</li>
     *   <li>그 외(push/미매핑) → null (개발 소유, pull이 무시)</li>
     * </ul>
     */
    public PullTarget pullFor(String jiraStatusId) {
        if (jiraStatusId == null || jiraStatusId.isBlank()) return null;

        Map<String, String> rej = raw.get(REJECTED_KEY);
        if (rej != null && jiraStatusId.equals(rej.get("jira_status_id"))) {
            String returnBlockId = rej.get("return_block_id");
            if (returnBlockId != null && !returnBlockId.isBlank()) {
                return new PullTarget(returnBlockId, QaState.REJECTED, true);
            }
        }

        for (var entry : raw.entrySet()) {
            if (REJECTED_KEY.equals(entry.getKey())) continue;
            Map<String, String> e = entry.getValue();
            if (!"pull".equalsIgnoreCase(e.getOrDefault("dir", "push"))) continue;
            if (jiraStatusId.equals(e.get("jira_status_id"))) {
                QaState qa = parseQa(e.get("qa"));
                return new PullTarget(entry.getKey(), qa != null ? qa : QaState.REVIEW, false);
            }
        }
        return null;
    }

    /**
     * 초기 배치용 — dir 무관하게 statusId가 가리키는 블록 id.
     * 신규 이슈를 JIRA 상태에 맞는 블록에 놓는다(push 블록 포함). 없으면 null.
     */
    public String blockForStatusId(String jiraStatusId) {
        if (jiraStatusId == null || jiraStatusId.isBlank()) return null;
        for (var entry : raw.entrySet()) {
            if (REJECTED_KEY.equals(entry.getKey())) continue;
            if (jiraStatusId.equals(entry.getValue().get("jira_status_id"))) {
                return entry.getKey();
            }
        }
        return null;
    }

    private static QaState parseQa(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return QaState.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
