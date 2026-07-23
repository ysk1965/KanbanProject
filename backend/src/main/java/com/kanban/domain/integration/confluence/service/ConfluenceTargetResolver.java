package com.kanban.domain.integration.confluence.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.integration.confluence.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 수집 전에 DB에서 읽을 것을 <b>먼저 다 읽어</b> 값으로 넘긴다.
 * (GitHub 쪽 {@code GithubTargetResolver}와 같은 이유 — HTTP를 트랜잭션 밖에서 하기 위해)
 *
 * <p>토큰 해석만은 여기서 함께 한다. 갱신된 토큰이 영속화되려면 트랜잭션 안이어야 하기 때문이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConfluenceTargetResolver {

    private final BoardRepository boardRepository;
    private final ConfluenceIntegrationConfigRepository configRepository;
    private final BoardConfluenceSourceRepository sourceRepository;
    private final ConfluenceOAuthService oauthService;

    public record SpaceTarget(String spaceKey, ConfluenceMatchRule matchRule,
                              String label, String parentPageId, String titlePattern) {
    }

    public record CollectionPlan(String cloudId, String baseUrl, String token, List<SpaceTarget> targets) {
        public boolean isEmpty() {
            return cloudId == null || token == null || targets.isEmpty();
        }
    }

    /**
     * 토큰이 만료 임박이면 여기서 갱신된다 — 그래서 쓰기 트랜잭션이다.
     */
    @Transactional
    public CollectionPlan resolve(String boardId) {
        Optional<ConfluenceIntegrationConfig> configOpt = resolveConfig(boardId);
        if (configOpt.isEmpty()) {
            return new CollectionPlan(null, null, null, List.of());
        }
        ConfluenceIntegrationConfig config = configOpt.get();
        if (config.getCloudId() == null) {
            // 인증은 됐지만 사이트를 아직 안 골랐다.
            return new CollectionPlan(null, null, null, List.of());
        }

        List<SpaceTarget> targets = sourceRepository.findByBoardIdAndActiveTrue(boardId).stream()
                .map(s -> new SpaceTarget(s.getSpaceKey(), s.getMatchRule(),
                        s.getLabel(), s.getParentPageId(), s.getTitlePattern()))
                .toList();
        if (targets.isEmpty()) {
            return new CollectionPlan(null, null, null, List.of());
        }

        String token;
        try {
            token = oauthService.resolveToken(config);
        } catch (Exception e) {
            log.warn("Confluence 토큰 해석 실패 board={}: {}", boardId, e.getMessage());
            return new CollectionPlan(null, null, null, List.of());
        }
        return new CollectionPlan(config.getCloudId(), config.getBaseUrl(), token, targets);
    }

    /** 보드에 직접 붙은 연결이 우선, 없으면 조직 연결 */
    @Transactional(readOnly = true)
    public Optional<ConfluenceIntegrationConfig> resolveConfig(String boardId) {
        Optional<ConfluenceIntegrationConfig> boardLevel =
                configRepository.findByBoardIdAndActiveTrue(boardId);
        if (boardLevel.isPresent()) {
            return boardLevel;
        }
        return boardRepository.findById(boardId)
                .map(Board::getOrganization)
                .filter(Objects::nonNull)
                .flatMap(org -> configRepository.findByOrganizationIdAndActiveTrue(org.getId()));
    }
}
