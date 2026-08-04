package com.kanban.domain.integration.jira.controller;

import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.integration.jira.service.JiraAutofixQueueService;
import com.kanban.domain.integration.jira.service.JiraAutofixTriageService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 자동수정 트리아지 API. 경로 규약: /api/v1/boards/{boardId}/jira/autofix/*
 *
 * <p>판정과 집계만 노출한다. 실제 수정·PR 생성은 여기 없다 — 후보 건수를 먼저 보고
 * 파이프라인 투자 여부를 결정하는 것이 이 단계의 목적이다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class JiraAutofixController {

    private final JiraAutofixTriageService triageService;
    private final JiraAutofixQueueService queueService;

    // ── 큐 ────────────────────────────────────────

    /**
     * 트리아지 후보를 큐에 담는다. confidence 임계값·이슈당 1회 가드레일이 여기서 걸린다.
     *
     * <p>본문에 {@code issue_keys}를 주면 그중에서만 고른다(화면에서 골라 담는 경로).
     * 없으면 조건을 만족하는 후보 전부.
     */
    @PostMapping("/api/v1/boards/{boardId}/jira/autofix/queue")
    public ResponseEntity<JiraAutofixResponse.EnqueueResult> enqueue(
            @PathVariable String boardId,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestBody(required = false) JiraAutofixRequest.Enqueue request,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<String> issueKeys = request != null ? request.getIssueKeys() : null;
        return ResponseEntity.ok(
                queueService.enqueueCandidates(boardId, principal.getUserId(), limit, issueKeys));
    }

    /** 큐 준비 상태 + 현황. 셋업 체크리스트와 배너가 이 값으로 그려진다. */
    @GetMapping("/api/v1/boards/{boardId}/jira/autofix/queue-status")
    public ResponseEntity<JiraAutofixResponse.QueueStatus> queueStatus(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queueService.getQueueStatus(boardId, principal.getUserId()));
    }

    @GetMapping("/api/v1/boards/{boardId}/jira/autofix/jobs")
    public ResponseEntity<List<JiraAutofixResponse.JobItem>> jobs(
            @PathVariable String boardId,
            @RequestParam(value = "limit", defaultValue = "50") int limit,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queueService.getJobs(boardId, principal.getUserId(), limit));
    }

    /** 아직 나가지 않은 작업만 취소할 수 있다 — 이미 러너가 물고 있으면 되돌릴 수 없다. */
    @DeleteMapping("/api/v1/boards/{boardId}/jira/autofix/jobs/{jobId}")
    public ResponseEntity<Map<String, String>> cancelJob(
            @PathVariable String boardId,
            @PathVariable String jobId,
            @AuthenticationPrincipal UserPrincipal principal) {
        queueService.cancelJob(boardId, principal.getUserId(), jobId);
        return ResponseEntity.ok(Map.of("message", "작업을 취소했습니다"));
    }

    /** 콜백 토큰 발급/조회(멱등). 러너 시크릿 BRIDGE_CALLBACK_TOKEN에 넣을 값. */
    @PostMapping("/api/v1/boards/{boardId}/jira/autofix/callback-token")
    public ResponseEntity<Map<String, String>> callbackToken(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of(
                "callback_token", queueService.ensureCallbackToken(boardId, principal.getUserId())));
    }

    // ── 트리아지 ───────────────────────────────────

    /**
     * 트리아지 실행. 이슈가 바뀌지 않은 건은 건너뛴다(재실행 비용 방지).
     * AI를 호출하므로 관리자 이상만 실행할 수 있다.
     *
     * @param force true면 전건 재판정
     */
    @PostMapping("/api/v1/boards/{boardId}/jira/autofix/triage")
    public ResponseEntity<JiraAutofixResponse.TriageRun> runTriage(
            @PathVariable String boardId,
            @RequestParam(value = "force", defaultValue = "false") boolean force,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(triageService.triageBoard(boardId, principal.getUserId(), force));
    }

    /**
     * 저장소 검증 기반 수준 설정 (NONE/PARTIAL/MATURE). 판정 기준이 통째로 달라지므로
     * 값이 바뀌면 기존 판정은 비워지고 다음 실행에서 전건 재판정된다.
     */
    @PutMapping("/api/v1/boards/{boardId}/jira/autofix/test-infra")
    public ResponseEntity<Map<String, String>> updateTestInfra(
            @PathVariable String boardId,
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        String level = triageService.updateTestInfra(
                boardId, principal.getUserId(), request.get("test_infra"));
        return ResponseEntity.ok(Map.of("test_infra", level));
    }

    @GetMapping("/api/v1/boards/{boardId}/jira/autofix/test-infra")
    public ResponseEntity<Map<String, String>> getTestInfra(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of(
                "test_infra", triageService.getTestInfra(boardId, principal.getUserId())));
    }

    /** 누적 집계 — 후보 비율과 유형별 분포. */
    @GetMapping("/api/v1/boards/{boardId}/jira/autofix/summary")
    public ResponseEntity<JiraAutofixResponse.Summary> summary(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(triageService.getSummary(boardId, principal.getUserId()));
    }

    /** 판정 목록. {@code verdict}로 CANDIDATE/CONDITIONAL/EXCLUDED 필터. */
    @GetMapping("/api/v1/boards/{boardId}/jira/autofix/items")
    public ResponseEntity<List<JiraAutofixResponse.TriageItem>> items(
            @PathVariable String boardId,
            @RequestParam(value = "verdict", required = false) String verdict,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(triageService.getItems(boardId, principal.getUserId(), verdict));
    }
}
