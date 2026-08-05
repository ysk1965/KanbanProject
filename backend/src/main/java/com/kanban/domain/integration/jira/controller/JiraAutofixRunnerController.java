package com.kanban.domain.integration.jira.controller;

import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.integration.jira.service.JiraAutofixQueueService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 자동수정 러너 전용 API. 공개 엔드포인트 — 보드별 시크릿 토큰으로 검증한다(SecurityConfig permit).
 *
 * <p>맥에서 도는 러너가 여기로 <b>작업을 가져간다</b>. 서버가 러너를 부르지 않는 이유는 두 가지다.
 * 맥은 사내망 뒤에 있어 인바운드가 없고, 언제 여유가 있는지는 맥만 안다.
 *
 * <pre>
 * POST /api/v1/jira/autofix/runner/{boardId}/claim      다음 한 건 가져가기
 * POST /api/v1/jira/autofix/runner/{boardId}/heartbeat  긴 작업 중 생존 신고
 * POST /api/v1/jira/autofix/callback/{boardId}          결과 회신 (JiraAutofixCallbackController)
 * </pre>
 *
 * <p>인증은 셋 다 {@code Authorization: Bearer <autofix_callback_token>} 하나로 통일한다 —
 * 러너가 들고 있어야 할 비밀이 늘어날수록 회전이 어려워진다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class JiraAutofixRunnerController {

    private final JiraAutofixQueueService queueService;

    /** 다음 작업을 가져간다. 내줄 게 없어도 200 + reason이다(러너 로그에 원인이 남아야 한다). */
    @PostMapping("/api/v1/jira/autofix/runner/{boardId}/claim")
    public ResponseEntity<JiraAutofixResponse.ClaimResult> claim(
            @PathVariable String boardId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) JiraAutofixRequest.RunnerHello body) {

        if (!authorized(boardId, authorization)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(
                queueService.claim(boardId, runnerName(body), contractVersion(body), status(body)));
    }

    /**
     * 생존 신고. 한 건을 처리하는 10~40분 동안 러너는 claim을 부르지 않으므로, 이게 없으면
     * 작업이 도는 내내 화면에는 러너가 죽은 것처럼 보인다.
     */
    @PostMapping("/api/v1/jira/autofix/runner/{boardId}/heartbeat")
    public ResponseEntity<Void> heartbeat(
            @PathVariable String boardId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) JiraAutofixRequest.RunnerHello body) {

        if (!authorized(boardId, authorization)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        queueService.heartbeat(boardId, runnerName(body), contractVersion(body), status(body));
        return ResponseEntity.ok().build();
    }

    private boolean authorized(String boardId, String authorization) {
        String prefix = "Bearer ";
        String token = authorization != null && authorization.startsWith(prefix)
                ? authorization.substring(prefix.length()).trim() : null;
        if (queueService.verifyCallbackToken(boardId, token)) return true;
        log.warn("Autofix runner request rejected (board={})", boardId);
        return false;
    }

    /** 러너 이름은 식별용 표시일 뿐 인증 수단이 아니다 — 길이만 자르고 그대로 쓴다. */
    private String runnerName(JiraAutofixRequest.RunnerHello body) {
        String name = body != null ? body.getRunnerName() : null;
        if (name == null || name.isBlank()) return "unknown";
        return name.length() > 100 ? name.substring(0, 100) : name;
    }

    private JiraAutofixRequest.RunnerStatus status(JiraAutofixRequest.RunnerHello body) {
        return body != null ? body.getStatus() : null;
    }

    /** 러너가 아는 작업 명세 계약 버전. 안 보내면 null이고, 서버는 그것을 "낡음"으로 본다. */
    private Integer contractVersion(JiraAutofixRequest.RunnerHello body) {
        return body != null ? body.getContractVersion() : null;
    }
}
