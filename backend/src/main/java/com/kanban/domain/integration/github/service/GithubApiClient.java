package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.domain.integration.github.dto.GithubCommit;
import com.kanban.domain.integration.github.dto.GithubRepoRef;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * GitHub REST v3 호출. 필요한 것은 세 가지뿐이다 — 설치 저장소 목록, 커밋 목록, 커밋 상세.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GithubApiClient {

    private static final int PAGE_SIZE = 100;

    private final GithubAppProperties properties;
    private final GithubAppTokenService tokenService;
    private final RestTemplate restTemplate;

    /**
     * 설치 메타데이터. 사용자가 보낸 installation_id가 실제로 우리 App의 설치인지 확인하는 용도라,
     * 설치 토큰이 아니라 <b>App JWT</b>로 호출한다.
     */
    public JsonNode getInstallation(String installationId) {
        String url = properties.getApiBaseUrl() + "/app/installations/" + installationId;
        return get(url, tokenService.createAppJwt());
    }

    /** 설치에 포함된 저장소 — 보드 설정에서 체크박스로 고를 목록 */
    public List<GithubRepoRef> listInstallationRepositories(String installationId) {
        String token = tokenService.getInstallationToken(installationId);
        List<GithubRepoRef> repos = new ArrayList<>();

        for (int page = 1; page <= 10; page++) {
            String url = UriComponentsBuilder
                    .fromUriString(properties.getApiBaseUrl() + "/installation/repositories")
                    .queryParam("per_page", PAGE_SIZE)
                    .queryParam("page", page)
                    .toUriString();

            JsonNode body = get(url, token);
            JsonNode items = body.path("repositories");
            if (!items.isArray() || items.isEmpty()) {
                break;
            }
            for (JsonNode repo : items) {
                repos.add(new GithubRepoRef(
                        repo.path("full_name").asText(),
                        repo.path("name").asText(),
                        repo.path("default_branch").asText("main"),
                        repo.path("private").asBoolean(false),
                        repo.path("html_url").asText(null)
                ));
            }
            if (items.size() < PAGE_SIZE) {
                break;
            }
        }
        return repos;
    }

    /**
     * 기간 내 커밋. {@code since}는 포함, {@code until}은 GitHub도 포함으로 다루므로
     * 끝점 중복을 피하려면 호출부가 1초를 빼서 넘긴다.
     *
     * @param branch null이면 저장소 기본 브랜치
     */
    public List<GithubCommit> listCommits(String installationId, String repoFullName,
                                          String branch, String sinceIso, String untilIso) {
        String token = tokenService.getInstallationToken(installationId);
        List<GithubCommit> commits = new ArrayList<>();
        int maxPages = Math.max(1, properties.getMaxCommitsPerRepo() / PAGE_SIZE + 1);

        for (int page = 1; page <= maxPages; page++) {
            UriComponentsBuilder builder = UriComponentsBuilder
                    .fromUriString(properties.getApiBaseUrl() + "/repos/" + repoFullName + "/commits")
                    .queryParam("since", sinceIso)
                    .queryParam("until", untilIso)
                    .queryParam("per_page", PAGE_SIZE)
                    .queryParam("page", page);
            if (branch != null && !branch.isBlank()) {
                builder.queryParam("sha", branch);
            }

            JsonNode body = get(builder.toUriString(), token);
            if (!body.isArray() || body.isEmpty()) {
                break;
            }
            for (JsonNode node : body) {
                GithubCommit commit = toCommit(node, repoFullName);
                if (commit != null) {
                    commits.add(commit);
                }
                if (commits.size() >= properties.getMaxCommitsPerRepo()) {
                    return commits;
                }
            }
            if (body.size() < PAGE_SIZE) {
                break;
            }
        }
        return commits;
    }

    /**
     * 커밋 상세 — 변경 파일 수와 추가/삭제 라인. 목록 API에는 없어서 커밋당 1회 더 호출해야 하므로
     * 호출부가 상한을 두고 부른다.
     */
    public GithubCommit enrichWithStats(String installationId, GithubCommit commit) {
        String token = tokenService.getInstallationToken(installationId);
        String url = properties.getApiBaseUrl() + "/repos/" + commit.repoFullName()
                + "/commits/" + commit.sha();
        try {
            JsonNode body = get(url, token);
            JsonNode stats = body.path("stats");
            return commit.withStats(
                    body.path("files").isArray() ? body.path("files").size() : 0,
                    stats.path("additions").asInt(0),
                    stats.path("deletions").asInt(0));
        } catch (BusinessException e) {
            // 상세 조회 실패는 보고서를 막을 만한 일이 아니다 — 지표만 비워 둔다.
            log.debug("커밋 상세 조회 실패 {} {}: {}", commit.repoFullName(), commit.sha(), e.getMessage());
            return commit;
        }
    }

    private GithubCommit toCommit(JsonNode node, String repoFullName) {
        String sha = node.path("sha").asText(null);
        if (sha == null) {
            return null;
        }
        JsonNode commitNode = node.path("commit");
        String message = commitNode.path("message").asText("");
        boolean merge = node.path("parents").isArray() && node.path("parents").size() > 1;

        String authorLogin = node.path("author").path("login").asText(null);
        String authorName = commitNode.path("author").path("name").asText(authorLogin);
        String dateText = commitNode.path("author").path("date").asText(null);

        return new GithubCommit(
                repoFullName,
                sha,
                message,
                authorLogin,
                authorName,
                dateText != null ? OffsetDateTime.parse(dateText) : null,
                node.path("html_url").asText(null),
                merge,
                0, 0, 0
        );
    }

    private JsonNode get(String url, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.valueOf("application/vnd.github+json")));
        headers.set("X-GitHub-Api-Version", "2022-11-28");

        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
            JsonNode body = response.getBody();
            if (body == null) {
                throw new BusinessException(ErrorCode.GITHUB_API_ERROR, "응답이 비어 있습니다");
            }
            return body;
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            log.warn("GitHub API 실패 url={} status={} body={}", url, status, e.getResponseBodyAsString());
            if (status == 401) {
                throw new BusinessException(ErrorCode.GITHUB_AUTH_FAILED);
            }
            if (status == 403 || status == 429) {
                // 403은 레이트 리밋일 수도, 권한 부족일 수도 있다 — 헤더로 구분한다.
                String remaining = e.getResponseHeaders() != null
                        ? e.getResponseHeaders().getFirst("x-ratelimit-remaining") : null;
                if ("0".equals(remaining) || status == 429) {
                    throw new BusinessException(ErrorCode.GITHUB_RATE_LIMITED);
                }
                throw new BusinessException(ErrorCode.GITHUB_AUTH_FAILED);
            }
            if (status == 404) {
                throw new BusinessException(ErrorCode.GITHUB_REPO_NOT_FOUND);
            }
            if (status == 409) {
                // 빈 저장소 — 커밋이 하나도 없다. 실패로 다루지 않는다.
                throw new BusinessException(ErrorCode.GITHUB_API_ERROR, "저장소가 비어 있습니다");
            }
            throw new BusinessException(ErrorCode.GITHUB_API_ERROR);
        }
    }
}
