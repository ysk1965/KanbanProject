package com.kanban.domain.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.ai.dto.CommitPlanRequest;
import com.kanban.domain.ai.service.CommitPlanService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * MILKYWAY 커밋 플랜 엔드포인트. 호출자는 Unity 에디터 툴({@code MilkywayAiDraft.cs})이다.
 *
 * <p><b>인증: 공용 저권한 PAT</b>({@code bsp_...}). {@code SecurityConfig}에 permitAll을 등록하지
 * <b>않았으므로</b> {@code anyRequest().authenticated()}가 적용된다 — 즉 이 엔드포인트를 열려면
 * SecurityConfig를 건드려야 하고, 실수로 열리지 않는다.
 *
 * <p>permitAll을 택하지 않은 이유: 호출 1회가 Anthropic 비용으로 직결되는데
 * {@code RateLimitingFilter}의 일반 버킷은 IP당 분당 600회다. 목적이 고정돼 있어도 비용 DoS가
 * 성립한다. 전용 버킷(분당 10회)과 인증을 함께 둔다.
 *
 * <p>PAT는 발급자의 권한을 상속하므로 <b>{@code SystemRole.USER} 서비스 계정에서 발급</b>해야 한다.
 * ADMIN 계정 PAT가 Unity 클라이언트에 박히면 그 토큰으로 {@code /admin/**} 전체가 열린다.
 *
 * <p>참고: PAT는 JWT가 아니라서 {@code RateLimitingFilter}가 토큰에서 userId를 못 뽑고
 * <b>IP 기준으로</b> 버킷을 잡는다. 즉 같은 출구 IP를 쓰는 팀원들이 버킷을 공유한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
public class CommitPlanController {

    private final CommitPlanService commitPlanService;

    @PostMapping("/commit-plan")
    public ResponseEntity<JsonNode> createCommitPlan(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody CommitPlanRequest request) {
        String userId = principal != null ? principal.getUserId() : null;
        return ResponseEntity.ok(commitPlanService.generate(request, userId));
    }

    /**
     * 이 컨트롤러만의 에러 형태.
     *
     * <p>클라이언트 계약이 {@code { "error": "<사람이 읽을 메시지>" }}를 요구하는데, 전역
     * {@code GlobalExceptionHandler}는 {@code {code, message, ...}}를 돌려준다. 전역 응답에
     * {@code error}를 추가하면 모든 API에 영향이 가므로 여기서만 형태를 바꾼다.
     * BRIDGE 내부 코드는 진단용으로 함께 싣는다(계약상 허용).
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, String>> handleBusinessException(BusinessException e) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", e.getMessage());
        body.put("code", e.getErrorCode().getCode());
        return ResponseEntity.status(e.getErrorCode().getStatus()).body(body);
    }

    /** 예상 밖 예외도 계약 형태를 지킨다. 원인 메시지는 노출하지 않는다. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception e) {
        log.error("Unexpected error while generating commit plan", e);
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "커밋 플랜 생성 중 오류가 발생했습니다"));
    }
}
