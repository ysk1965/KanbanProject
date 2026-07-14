package com.kanban.domain.auth.pat;

import com.kanban.domain.auth.pat.dto.PatDto;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 개인 액세스 토큰(PAT) 관리 API.
 *
 * <p>{@code /api/v1/auth/**} 는 permitAll 이므로 의도적으로 {@code /api/v1/pat} 에 둔다.
 * SecurityConfig 의 {@code anyRequest().authenticated()} 로 보호되어,
 * 정상 로그인(JWT)한 사용자만 자신의 토큰을 발급/조회/폐기할 수 있다.
 */
@RestController
@RequestMapping("/api/v1/pat")
@RequiredArgsConstructor
public class PatController {

    private final PatService patService;

    @PostMapping
    public ResponseEntity<PatDto.Created> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PatDto.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(patService.create(principal.getUserId(), request));
    }

    @GetMapping
    public ResponseEntity<List<PatDto.Response>> list(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(patService.list(principal.getUserId()));
    }

    @DeleteMapping("/{tokenId}")
    public ResponseEntity<Void> revoke(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String tokenId) {
        patService.revoke(principal.getUserId(), tokenId);
        return ResponseEntity.noContent().build();
    }
}
