package com.kanban.domain.integration.confluence.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.confluence.*;
import com.kanban.domain.integration.confluence.config.ConfluenceOAuthProperties;
import com.kanban.domain.integration.confluence.dto.ConfluenceRequest;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 보드 ↔ Confluence 연결과 스페이스 선택. GitHub 쪽과 같은 모양(연결/선택 분리)을 따른다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConfluenceConnectionService {

    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final ConfluenceIntegrationConfigRepository configRepository;
    private final BoardConfluenceSourceRepository sourceRepository;
    private final ConfluenceTargetResolver targetResolver;
    private final ConfluenceOAuthService oauthService;
    private final ConfluenceApiClient apiClient;
    private final ConfluenceOAuthProperties oauthProps;

    @Transactional
    public List<ConfluenceResponse.SpaceRef> listSpaces(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        ConfluenceIntegrationConfig config = requireConnected(boardId);
        if (config.getCloudId() == null) {
            throw new BusinessException(ErrorCode.CONFLUENCE_SITE_NOT_SELECTED);
        }
        String token = oauthService.resolveToken(config);
        return apiClient.listSpaces(config.getCloudId(), token);
    }

    /**
     * 스페이스 선택을 통째로 교체한다.
     */
    @Transactional
    public ConfluenceResponse.Status selectSpaces(String boardId, String userId,
                                                  ConfluenceRequest.SelectSpaces request) {
        boardService.checkAdminOrAbove(boardId, userId);
        ConfluenceIntegrationConfig config = requireConnected(boardId);
        if (config.getCloudId() == null) {
            throw new BusinessException(ErrorCode.CONFLUENCE_SITE_NOT_SELECTED);
        }
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<ConfluenceRequest.SpaceSelection> requested =
                request.getSpaces() != null ? request.getSpaces() : List.of();

        Map<String, BoardConfluenceSource> existing = new LinkedHashMap<>();
        for (BoardConfluenceSource source : sourceRepository.findByBoardId(boardId)) {
            existing.put(source.getSpaceKey(), source);
        }

        Set<String> keep = new HashSet<>();
        for (ConfluenceRequest.SpaceSelection selection : requested) {
            keep.add(selection.getSpaceKey());
            ConfluenceMatchRule rule = parseRule(selection.getMatchRule());
            validateRule(rule, selection);

            BoardConfluenceSource source = existing.get(selection.getSpaceKey());
            if (source != null) {
                source.update(rule, selection.getLabel(), selection.getParentPageId(),
                        selection.getTitlePattern(), true);
            } else {
                sourceRepository.save(BoardConfluenceSource.builder()
                        .board(board)
                        .config(config)
                        .spaceKey(selection.getSpaceKey())
                        .spaceName(selection.getSpaceName())
                        .matchRule(rule)
                        .label(selection.getLabel())
                        .parentPageId(selection.getParentPageId())
                        .titlePattern(selection.getTitlePattern())
                        .build());
            }
        }
        existing.values().stream()
                .filter(source -> !keep.contains(source.getSpaceKey()))
                .forEach(sourceRepository::delete);

        if (keep.isEmpty()) {
            config.markTargetNotSelected();
        } else {
            config.markTargetSelected();
        }
        return buildStatus(boardId, Optional.of(config));
    }

    @Transactional(readOnly = true)
    public ConfluenceResponse.Status getStatus(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return buildStatus(boardId, targetResolver.resolveConfig(boardId));
    }

    @Transactional
    public void disconnect(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        sourceRepository.deleteAll(sourceRepository.findByBoardId(boardId));
        // 조직 연결은 다른 보드가 쓰고 있으므로 건드리지 않는다.
        configRepository.findByBoardIdAndActiveTrue(boardId)
                .ifPresent(ConfluenceIntegrationConfig::deactivate);
    }

    private ConfluenceResponse.Status buildStatus(String boardId,
                                                  Optional<ConfluenceIntegrationConfig> configOpt) {
        List<ConfluenceResponse.SelectedSpace> spaces = sourceRepository.findByBoardId(boardId).stream()
                .map(source -> ConfluenceResponse.SelectedSpace.builder()
                        .spaceKey(source.getSpaceKey())
                        .spaceName(source.getSpaceName())
                        .matchRule(source.getMatchRule().name())
                        .label(source.getLabel())
                        .parentPageId(source.getParentPageId())
                        .titlePattern(source.getTitlePattern())
                        .active(Boolean.TRUE.equals(source.getActive()))
                        .build())
                .toList();

        if (configOpt.isEmpty()) {
            return ConfluenceResponse.Status.builder()
                    .connected(false)
                    .spaces(spaces)
                    .appConfigured(oauthProps.isConfigured())
                    .build();
        }
        ConfluenceIntegrationConfig config = configOpt.get();
        return ConfluenceResponse.Status.builder()
                .status(config.getStatus().name())
                .connected(true)
                .siteName(config.getSiteName())
                .baseUrl(config.getBaseUrl())
                .cloudId(config.getCloudId())
                .authType(config.getAuthType().name())
                .spaces(spaces)
                .lastError(config.getLastError())
                .appConfigured(oauthProps.isConfigured())
                .build();
    }

    private ConfluenceIntegrationConfig requireConnected(String boardId) {
        return targetResolver.resolveConfig(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONFLUENCE_NOT_CONNECTED));
    }

    private ConfluenceMatchRule parseRule(String rule) {
        if (rule == null || rule.isBlank()) {
            return ConfluenceMatchRule.LABEL;
        }
        try {
            return ConfluenceMatchRule.valueOf(rule.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE,
                    "match_rule은 LABEL, PARENT_PAGE, TITLE_PATTERN, PARENT_TREE_CHANGELOG 중 하나여야 합니다");
        }
    }

    /** 규칙만 고르고 값을 비워 두면 그 스페이스의 모든 페이지가 딸려 온다 — 저장 전에 막는다. */
    private void validateRule(ConfluenceMatchRule rule, ConfluenceRequest.SpaceSelection selection) {
        boolean valid = switch (rule) {
            case LABEL -> selection.getLabel() != null && !selection.getLabel().isBlank();
            case PARENT_PAGE, PARENT_TREE_CHANGELOG ->
                    selection.getParentPageId() != null && !selection.getParentPageId().isBlank();
            case TITLE_PATTERN -> selection.getTitlePattern() != null && !selection.getTitlePattern().isBlank();
        };
        if (!valid) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE,
                    "선택한 식별 규칙에 필요한 값이 비어 있습니다 (" + rule.name() + ")");
        }
    }
}
