package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.domain.integration.github.dto.GithubCommit;
import com.kanban.domain.integration.github.dto.GithubRepoRef;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * GitHub REST v3 호출. 필요한 것은 세 가지뿐이다 — 설치 저장소 목록, 커밋 목록, 커밋 상세.
 */
@Slf4j
@Component
public class GithubApiClient {

    private static final int PAGE_SIZE = 100;

    /** 커밋당 AI 매칭에 넘길 파일 경로 상한. 너무 많으면 토큰만 먹고 신호는 앞쪽 몇 개면 충분하다. */
    private static final int MAX_FILES_PER_COMMIT = 12;

    private final GithubAppProperties properties;
    private final GithubAppTokenService tokenService;
    private final RestTemplate restTemplate;

    public GithubApiClient(GithubAppProperties properties,
                           GithubAppTokenService tokenService,
                           @Qualifier("githubRestTemplate") RestTemplate restTemplate) {
        this.properties = properties;
        this.tokenService = tokenService;
        this.restTemplate = restTemplate;
    }

    /**
     * 설치 메타데이터. 사용자가 보낸 installation_id가 실제로 우리 App의 설치인지 확인하는 용도라,
     * 설치 토큰이 아니라 <b>App JWT</b>로 호출한다.
     */
    public JsonNode getInstallation(String installationId) {
        String url = properties.getApiBaseUrl() + "/app/installations/" + installationId;
        return get(url, tokenService.createAppJwt());
    }

    /** username 존재 확인용 요약 — 보드 공유 모달에서 멤버에 붙일 GitHub 로그인이 실재하는지 볼 때 쓴다. */
    public record GithubUserRef(String login, String name, String avatarUrl, String htmlUrl, String type) {
    }

    /**
     * GitHub username 조회. 설치가 있으면 그 토큰으로(레이트 리밋 5000/h), 없으면 비인증으로(60/h) 부른다 —
     * 존재 여부만 볼 거라 둘 다 동작한다.
     *
     * @return 존재하면 사용자 요약, 없으면(404) {@code null}
     */
    public GithubUserRef findUser(String installationId, String login) {
        String token = installationId != null ? tokenService.getInstallationToken(installationId) : null;
        String url = properties.getApiBaseUrl() + "/users/" + login;

        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        headers.setAccept(List.of(MediaType.valueOf("application/vnd.github+json")));
        headers.set("X-GitHub-Api-Version", "2022-11-28");

        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
            JsonNode body = response.getBody();
            if (body == null) {
                return null;
            }
            return new GithubUserRef(
                    text(body, "login"),
                    text(body, "name"),
                    text(body, "avatar_url"),
                    text(body, "html_url"),
                    text(body, "type"));
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            if (status == 404) {
                return null; // 없는 계정 — 오류가 아니라 정상적인 "미존재" 응답이다.
            }
            if (status == 403 || status == 429) {
                String remaining = e.getResponseHeaders() != null
                        ? e.getResponseHeaders().getFirst("x-ratelimit-remaining") : null;
                if ("0".equals(remaining) || status == 429) {
                    throw new BusinessException(ErrorCode.GITHUB_RATE_LIMITED);
                }
            }
            log.warn("GitHub 사용자 조회 실패 login={} status={}", login, status);
            throw new BusinessException(ErrorCode.GITHUB_API_ERROR);
        }
    }

    /** JSON null("name": null)을 문자열 "null"로 오독하지 않도록 hasNonNull로 감싼다. */
    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
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

    /** 저장소의 브랜치 목록 — 보드 설정에서 보고서에 쓸 브랜치를 고를 후보 */
    public List<String> listBranches(String installationId, String repoFullName) {
        String token = tokenService.getInstallationToken(installationId);
        List<String> branches = new ArrayList<>();

        for (int page = 1; page <= 10; page++) {
            String url = UriComponentsBuilder
                    .fromUriString(properties.getApiBaseUrl() + "/repos/" + repoFullName + "/branches")
                    .queryParam("per_page", PAGE_SIZE)
                    .queryParam("page", page)
                    .toUriString();

            JsonNode body = get(url, token);
            if (!body.isArray() || body.isEmpty()) {
                break;
            }
            for (JsonNode node : body) {
                String name = node.path("name").asText(null);
                if (name != null) {
                    branches.add(name);
                }
            }
            if (body.size() < PAGE_SIZE) {
                break;
            }
        }
        return branches;
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

            // 목록 조회만 일시적 타임아웃에 재시도한다 — 저장소 1개짜리 보드에서
            // 순간적 지연 한 번으로 소스 전체가 실패하는 것을 막는다.
            JsonNode body = get(builder.toUriString(), token, properties.getApiRetryCount());
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
            JsonNode filesNode = body.path("files");
            int changedFiles = filesNode.isArray() ? filesNode.size() : 0;
            List<String> files = new ArrayList<>();
            if (filesNode.isArray()) {
                for (JsonNode f : filesNode) {
                    String name = f.path("filename").asText(null);
                    if (name != null && !name.isBlank()) {
                        files.add(name);
                    }
                    if (files.size() >= MAX_FILES_PER_COMMIT) {
                        break;
                    }
                }
            }
            return commit.withStats(
                    changedFiles,
                    stats.path("additions").asInt(0),
                    stats.path("deletions").asInt(0),
                    files);
        } catch (BusinessException | RestClientException e) {
            // 상세 조회 실패는 보고서를 막을 만한 일이 아니다 — 지표만 비워 둔다.
            // 타임아웃/IO(ResourceAccessException)도 RestClientException 하위라 여기서 함께 삼킨다.
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
                0, 0, 0,
                List.of()
        );
    }

    private JsonNode get(String url, String token) {
        return get(url, token, 0);
    }

    /**
     * GitHub GET. {@code retriesOnTimeout}만큼 <b>일시적 타임아웃/IO</b>({@link ResourceAccessException})에만
     * 짧은 백오프로 재시도한다. 4xx·레이트 리밋(403/429)은 상태 응답이라 재시도 없이 그대로 매핑한다.
     */
    private JsonNode get(String url, String token, int retriesOnTimeout) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.valueOf("application/vnd.github+json")));
        headers.set("X-GitHub-Api-Version", "2022-11-28");
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        int attempt = 0;
        while (true) {
            try {
                ResponseEntity<JsonNode> response = restTemplate.exchange(
                        url, HttpMethod.GET, entity, JsonNode.class);
                JsonNode body = response.getBody();
                if (body == null) {
                    throw new BusinessException(ErrorCode.GITHUB_API_ERROR, "응답이 비어 있습니다");
                }
                return body;
            } catch (ResourceAccessException e) {
                // 연결/read 타임아웃·IO — GitHub가 순간적으로 느릴 때 잦다. 상한까지만 재시도.
                if (attempt++ >= retriesOnTimeout) {
                    throw e;
                }
                log.debug("GitHub 타임아웃 재시도 {}/{} url={}: {}",
                        attempt, retriesOnTimeout, url, e.getMessage());
                backoff(properties.getApiRetryBackoffMillis() * attempt);
            } catch (HttpStatusCodeException e) {
                // 상태 응답(4xx/5xx)은 재시도 대상이 아니다 — 바로 도메인 예외로 매핑한다.
                throw mapStatusError(url, e);
            }
        }
    }

    /** 재시도 사이 대기. 인터럽트되면 플래그를 복원하고 재시도를 중단한다. */
    private void backoff(long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.GITHUB_API_ERROR, "재시도 대기 중 중단됨");
        }
    }

    private BusinessException mapStatusError(String url, HttpStatusCodeException e) {
        int status = e.getStatusCode().value();
        log.warn("GitHub API 실패 url={} status={} body={}", url, status, e.getResponseBodyAsString());
        if (status == 401) {
            return new BusinessException(ErrorCode.GITHUB_AUTH_FAILED);
        }
        if (status == 403 || status == 429) {
            // 403은 레이트 리밋일 수도, 권한 부족일 수도 있다 — 헤더로 구분한다.
            String remaining = e.getResponseHeaders() != null
                    ? e.getResponseHeaders().getFirst("x-ratelimit-remaining") : null;
            if ("0".equals(remaining) || status == 429) {
                return new BusinessException(ErrorCode.GITHUB_RATE_LIMITED);
            }
            return new BusinessException(ErrorCode.GITHUB_AUTH_FAILED);
        }
        if (status == 404) {
            return new BusinessException(ErrorCode.GITHUB_REPO_NOT_FOUND);
        }
        if (status == 409) {
            // 빈 저장소 — 커밋이 하나도 없다. 실패로 다루지 않는다.
            return new BusinessException(ErrorCode.GITHUB_API_ERROR, "저장소가 비어 있습니다");
        }
        return new BusinessException(ErrorCode.GITHUB_API_ERROR);
    }
}
