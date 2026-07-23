package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.IntegrationScope;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.GithubInstallation;
import com.kanban.domain.integration.github.GithubInstallationRepository;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.domain.integration.github.dto.GithubRequest;
import com.kanban.domain.integration.github.dto.GithubResponse;
import com.kanban.domain.integration.github.dto.GithubRepoRef;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 보드 ↔ GitHub 설치 연결과 저장소 선택.
 *
 * <p>인증(설치)과 선택(저장소)을 분리해 다루는 것이 이 서비스의 전부다.
 * 조직에 한 번 설치해 두면 그 조직의 모든 보드가 재인증 없이 저장소만 고른다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GithubConnectionService {

    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final GithubInstallationRepository installationRepository;
    private final BoardGithubRepoRepository boardRepoRepository;
    private final GithubApiClient apiClient;
    private final GithubAppTokenService tokenService;
    private final GithubAppProperties properties;
    private final GithubTargetResolver targetResolver;
    private final ObjectMapper objectMapper;

    // ── 설치 ────────────────────────────────────

    public GithubResponse.InstallUrl getInstallUrl(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        requireAppConfigured();
        if (properties.getSlug() == null || properties.getSlug().isBlank()) {
            throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED, "App slug가 설정되지 않았습니다");
        }
        // state로 보드를 실어 보내면 GitHub이 설치 후 그대로 돌려준다.
        String url = "https://github.com/apps/" + properties.getSlug()
                + "/installations/new?state=" + boardId;
        return GithubResponse.InstallUrl.builder().url(url).build();
    }

    /**
     * 설치 완료 후 프론트가 받은 installation_id를 보드에 붙인다.
     * <b>사용자가 보낸 값을 그대로 믿지 않고</b> App JWT로 실제 설치인지 확인한다.
     */
    @Transactional
    public GithubResponse.Status linkInstallation(String boardId, String userId,
                                                  GithubRequest.LinkInstallation request) {
        boardService.checkAdminOrAbove(boardId, userId);
        requireAppConfigured();

        JsonNode installation = apiClient.getInstallation(request.getInstallationId());
        String accountLogin = installation.path("account").path("login").asText(null);
        String accountType = installation.path("account").path("type").asText(null);
        if (accountLogin == null) {
            throw new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED, "설치 정보를 확인할 수 없습니다");
        }

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        boolean shareWithOrg = !Boolean.FALSE.equals(request.getShareWithOrganization())
                && board.getOrganization() != null;

        GithubInstallation entity = shareWithOrg
                ? upsertOrganizationInstallation(board, user, request.getInstallationId(), accountLogin, accountType)
                : upsertBoardInstallation(board, user, request.getInstallationId(), accountLogin, accountType);

        return buildStatus(boardId, Optional.of(entity));
    }

    private GithubInstallation upsertOrganizationInstallation(Board board, User user, String installationId,
                                                              String accountLogin, String accountType) {
        String organizationId = board.getOrganization().getId();
        return installationRepository
                .findByInstallationIdAndOrganizationId(installationId, organizationId)
                .map(existing -> {
                    existing.reinstall(accountLogin, accountType, user);
                    return existing;
                })
                .orElseGet(() -> installationRepository.save(GithubInstallation.builder()
                        .organization(board.getOrganization())
                        .scope(IntegrationScope.ORGANIZATION)
                        .installationId(installationId)
                        .accountLogin(accountLogin)
                        .accountType(accountType)
                        .installedBy(user)
                        .build()));
    }

    private GithubInstallation upsertBoardInstallation(Board board, User user, String installationId,
                                                       String accountLogin, String accountType) {
        return installationRepository
                .findByInstallationIdAndBoardId(installationId, board.getId())
                .map(existing -> {
                    existing.reinstall(accountLogin, accountType, user);
                    return existing;
                })
                .orElseGet(() -> installationRepository.save(GithubInstallation.builder()
                        .board(board)
                        .scope(IntegrationScope.BOARD)
                        .installationId(installationId)
                        .accountLogin(accountLogin)
                        .accountType(accountType)
                        .installedBy(user)
                        .build()));
    }

    @Transactional
    public void disconnect(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        // 저장소 선택은 보드 것이므로 항상 지운다.
        boardRepoRepository.deleteAll(boardRepoRepository.findByBoardId(boardId));

        // 조직 설치는 다른 보드가 쓰고 있으므로 끊지 않는다 — 이 보드의 선택만 비운다.
        installationRepository.findByBoardIdAndActiveTrue(boardId).ifPresent(installation -> {
            installation.deactivate();
            tokenService.evict(installation.getInstallationId());
        });
    }

    // ── 저장소 ──────────────────────────────────

    @Transactional(readOnly = true)
    public List<GithubResponse.AvailableRepo> listAvailableRepos(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        GithubInstallation installation = targetResolver.resolveInstallation(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED));

        Set<String> selected = boardRepoRepository.findByBoardId(boardId).stream()
                .map(BoardGithubRepo::getRepoFullName)
                .collect(java.util.stream.Collectors.toSet());

        List<GithubRepoRef> repos = apiClient.listInstallationRepositories(installation.getInstallationId());
        return repos.stream()
                .map(r -> GithubResponse.AvailableRepo.builder()
                        .fullName(r.fullName())
                        .name(r.name())
                        .defaultBranch(r.defaultBranch())
                        .isPrivate(r.isPrivate())
                        .htmlUrl(r.htmlUrl())
                        .selected(selected.contains(r.fullName()))
                        .build())
                .toList();
    }

    /**
     * 선택 목록을 통째로 교체한다. 빠진 저장소는 지우고, 남은 것은 브랜치·제외 작성자를 갱신한다.
     */
    @Transactional
    public GithubResponse.Status selectRepos(String boardId, String userId,
                                             GithubRequest.SelectRepos request) {
        boardService.checkAdminOrAbove(boardId, userId);
        GithubInstallation installation = targetResolver.resolveInstallation(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED));

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<GithubRequest.RepoSelection> requested =
                request.getRepos() != null ? request.getRepos() : List.of();

        // 설치에 없는 저장소를 몰래 끼워 넣지 못하게 실제 목록과 대조한다.
        Set<String> allowed = apiClient.listInstallationRepositories(installation.getInstallationId())
                .stream().map(GithubRepoRef::fullName).collect(java.util.stream.Collectors.toSet());
        for (GithubRequest.RepoSelection selection : requested) {
            if (!allowed.contains(selection.getRepoFullName())) {
                throw new BusinessException(ErrorCode.GITHUB_REPO_NOT_FOUND, selection.getRepoFullName());
            }
        }

        Map<String, BoardGithubRepo> existing = new LinkedHashMap<>();
        for (BoardGithubRepo repo : boardRepoRepository.findByBoardId(boardId)) {
            existing.put(repo.getRepoFullName(), repo);
        }

        Set<String> keep = new HashSet<>();
        for (GithubRequest.RepoSelection selection : requested) {
            keep.add(selection.getRepoFullName());
            String excludeJson = writeExcludeAuthors(selection.getExcludeAuthors());
            BoardGithubRepo repo = existing.get(selection.getRepoFullName());
            if (repo != null) {
                repo.update(selection.getBranch(), excludeJson, true);
            } else {
                boardRepoRepository.save(BoardGithubRepo.builder()
                        .board(board)
                        .installation(installation)
                        .repoFullName(selection.getRepoFullName())
                        .branch(selection.getBranch())
                        .excludeAuthorsJson(excludeJson)
                        .build());
            }
        }
        existing.values().stream()
                .filter(repo -> !keep.contains(repo.getRepoFullName()))
                .forEach(boardRepoRepository::delete);

        if (keep.isEmpty()) {
            // 전부 해제하면 연결은 살아 있되 볼 대상이 없는 상태로 되돌아간다.
            installation.markTargetNotSelected();
        } else {
            installation.markTargetSelected();
        }
        return buildStatus(boardId, Optional.of(installation));
    }

    // ── 상태 ────────────────────────────────────

    @Transactional(readOnly = true)
    public GithubResponse.Status getStatus(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return buildStatus(boardId, targetResolver.resolveInstallation(boardId));
    }

    private GithubResponse.Status buildStatus(String boardId, Optional<GithubInstallation> installationOpt) {
        List<GithubResponse.SelectedRepo> selected = boardRepoRepository.findByBoardId(boardId).stream()
                .map(repo -> GithubResponse.SelectedRepo.builder()
                        .repoFullName(repo.getRepoFullName())
                        .branch(repo.getBranch())
                        .excludeAuthors(readExcludeAuthors(repo.getExcludeAuthorsJson()))
                        .active(Boolean.TRUE.equals(repo.getActive()))
                        .build())
                .toList();

        if (installationOpt.isEmpty()) {
            return GithubResponse.Status.builder()
                    .connected(false)
                    .selectedRepos(selected)
                    .appConfigured(properties.isConfigured())
                    .build();
        }

        GithubInstallation installation = installationOpt.get();
        return GithubResponse.Status.builder()
                .status(installation.getStatus().name())
                .connected(true)
                .accountLogin(installation.getAccountLogin())
                .scope(installation.getScope().name())
                .installationId(installation.getInstallationId())
                .selectedRepos(selected)
                .lastError(installation.getLastError())
                .appConfigured(properties.isConfigured())
                .build();
    }

    private String writeExcludeAuthors(List<String> authors) {
        if (authors == null || authors.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(authors);
        } catch (Exception e) {
            return null;
        }
    }

    private List<String> readExcludeAuthors(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private void requireAppConfigured() {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED);
        }
    }
}
