package com.kanban.domain.integration.github.controller;

import com.kanban.domain.integration.github.dto.GithubRequest;
import com.kanban.domain.integration.github.dto.GithubResponse;
import com.kanban.domain.integration.github.service.GithubConnectionService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 보드별 GitHub 연동 API. 경로 규약: /api/v1/boards/{boardId}/github/*
 *
 * <p>연결(설치)과 선택(저장소)이 분리돼 있어 엔드포인트도 그렇게 갈린다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/boards/{boardId}/github")
public class GithubController {

    private final GithubConnectionService connectionService;

    /** 설치 페이지로 보낼 주소 */
    @GetMapping("/install-url")
    public ResponseEntity<GithubResponse.InstallUrl> installUrl(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.getInstallUrl(boardId, principal.getUserId()));
    }

    /** 설치 후 GitHub이 돌려준 installation_id를 보드에 붙인다 */
    @PostMapping("/installations")
    public ResponseEntity<GithubResponse.Status> linkInstallation(
            @PathVariable String boardId,
            @Valid @RequestBody GithubRequest.LinkInstallation request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                connectionService.linkInstallation(boardId, principal.getUserId(), request));
    }

    @GetMapping("/status")
    public ResponseEntity<GithubResponse.Status> status(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.getStatus(boardId, principal.getUserId()));
    }

    /** 설치에 포함된 저장소 목록 — 체크박스로 고를 후보 */
    @GetMapping("/repos")
    public ResponseEntity<List<GithubResponse.AvailableRepo>> availableRepos(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.listAvailableRepos(boardId, principal.getUserId()));
    }

    /** 선택 목록 통째 교체 */
    @PutMapping("/repos")
    public ResponseEntity<GithubResponse.Status> selectRepos(
            @PathVariable String boardId,
            @Valid @RequestBody GithubRequest.SelectRepos request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                connectionService.selectRepos(boardId, principal.getUserId(), request));
    }

    @DeleteMapping
    public ResponseEntity<Void> disconnect(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        connectionService.disconnect(boardId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
