package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.GithubInstallation;
import com.kanban.domain.integration.github.GithubInstallationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 수집에 필요한 것을 DB에서 <b>먼저 다 읽어 분리된 값으로</b> 넘긴다.
 *
 * <p>이 클래스가 따로 있는 이유는 트랜잭션 경계 때문이다. GitHub 호출은 커밋 상세까지 하면
 * 수십 번이 나가는데, 그 사이 DB 커넥션을 붙들고 있으면 보드를 순회하는 스케줄러가 풀을 말린다.
 * 조회는 여기서 짧게 끝내고, HTTP는 트랜잭션 밖에서 한다.
 * (같은 빈 안에서 부르면 프록시를 거치지 않아 트랜잭션이 걸리지 않으므로 별도 빈이어야 한다)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GithubTargetResolver {

    private final BoardRepository boardRepository;
    private final GithubInstallationRepository installationRepository;
    private final BoardGithubRepoRepository boardRepoRepository;
    private final ObjectMapper objectMapper;

    /** 수집 대상 한 건 — 엔티티가 아니라 값이라 트랜잭션 밖에서 안전하다. */
    public record RepoTarget(String repoFullName, String branch, Set<String> excludedAuthors) {
    }

    public record CollectionPlan(String installationId, List<RepoTarget> targets) {
        public boolean isEmpty() {
            return installationId == null || targets.isEmpty();
        }
    }

    @Transactional(readOnly = true)
    public CollectionPlan resolve(String boardId) {
        Optional<GithubInstallation> installation = resolveInstallation(boardId);
        if (installation.isEmpty()) {
            return new CollectionPlan(null, List.of());
        }
        List<RepoTarget> targets = boardRepoRepository.findByBoardIdAndActiveTrue(boardId).stream()
                .map(this::toTarget)
                .toList();
        return new CollectionPlan(installation.get().getInstallationId(), targets);
    }

    /**
     * 보드에 직접 붙은 설치가 우선, 없으면 보드가 속한 조직의 설치를 쓴다.
     */
    @Transactional(readOnly = true)
    public Optional<GithubInstallation> resolveInstallation(String boardId) {
        Optional<GithubInstallation> boardLevel = installationRepository.findByBoardIdAndActiveTrue(boardId);
        if (boardLevel.isPresent()) {
            return boardLevel;
        }
        return boardRepository.findById(boardId)
                .map(Board::getOrganization)
                .filter(Objects::nonNull)
                .flatMap(org -> installationRepository.findByOrganizationIdAndActiveTrue(org.getId()));
    }

    private RepoTarget toTarget(BoardGithubRepo repo) {
        return new RepoTarget(repo.getRepoFullName(), repo.getBranch(),
                parseExcludedAuthors(repo.getExcludeAuthorsJson()));
    }

    private Set<String> parseExcludedAuthors(String json) {
        if (json == null || json.isBlank()) {
            return Set.of();
        }
        try {
            List<String> raw = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            return raw.stream()
                    .filter(Objects::nonNull)
                    .map(s -> s.toLowerCase(Locale.ROOT))
                    .collect(Collectors.toSet());
        } catch (Exception e) {
            log.warn("제외 작성자 목록 파싱 실패: {}", e.getMessage());
            return Set.of();
        }
    }
}
