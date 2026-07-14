package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.jira.JiraAuthType;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.JiraIssueLinkRepository;
import com.kanban.domain.integration.jira.JiraUserMappingRepository;
import com.kanban.domain.integration.jira.dto.JiraRequest;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JIRA 연결 설정(config)의 생성·검증·매핑·해제. 이슈 가져오기는 {@link JiraImportService} 담당.
 * DiscordService의 권한/게이트/예외 관용구를 따른다. JIRA 연동은 무료 기능이라 프리미엄 게이트 없음.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JiraConnectionService {

    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final SlackTokenEncryptor tokenEncryptor;
    private final ObjectMapper objectMapper;

    // ── 연결 ──────────────────────────────────────

    @Transactional
    public JiraResponse.Status connect(String boardId, String userId, JiraRequest.Connect request) {
        boardService.checkAdminOrAbove(boardId, userId);

        // 저장 전 자격증명 검증: /myself + /project/{key}
        try {
            JiraAuthContext probe = JiraAuthContext.basic(request.getBaseUrl(), request.getAccountEmail(), request.getApiToken());
            jiraApiClient.getMyself(probe);
            jiraApiClient.getProject(probe, request.getProjectKey());
        } catch (BusinessException e) {
            log.warn("JIRA connect validation failed for board {}: {}", boardId, e.getErrorCode());
            if (e.getErrorCode() == ErrorCode.JIRA_ISSUE_NOT_FOUND) {
                throw new BusinessException(ErrorCode.JIRA_PROJECT_NOT_FOUND);
            }
            if (e.getErrorCode() == ErrorCode.JIRA_AUTH_FAILED) {
                throw e;
            }
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED);
        }

        String encryptedToken = tokenEncryptor.encrypt(request.getApiToken());

        JiraIntegrationConfig config = configRepository.findByBoardId(boardId).orElse(null);
        if (config == null) {
            Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            config = JiraIntegrationConfig.builder()
                .board(board)
                .baseUrl(normalizeHost(request.getBaseUrl()))
                .projectKey(request.getProjectKey())
                .jql(request.getJql())
                .authType(JiraAuthType.API_TOKEN)
                .accountEmail(request.getAccountEmail())
                .apiTokenEncrypted(encryptedToken)
                .connectedBy(user)
                .build();
            config = configRepository.save(config);
            log.info("JIRA connected to board {} (project {}) by user {}", boardId, request.getProjectKey(), userId);
        } else {
            config.updateConnection(normalizeHost(request.getBaseUrl()), request.getCloudId(),
                request.getProjectKey(), JiraAuthType.API_TOKEN, request.getAccountEmail(), encryptedToken);
            config.updateJql(request.getJql());
            log.info("JIRA connection updated for board {} by user {}", boardId, userId);
        }
        return toStatus(config);
    }

    // ── 연결 테스트 ────────────────────────────────

    @Transactional
    public JiraResponse.TestResult testConnection(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        String token = oauthService.resolveToken(config);
        try {
            JsonNode project = jiraApiClient.getProject(JiraAuthContext.of(config, token), config.getProjectKey());
            String projectName = project != null && project.hasNonNull("name") ? project.get("name").asText() : config.getProjectKey();
            return JiraResponse.TestResult.builder()
                .success(true)
                .message("연결됨 · " + projectName)
                .projectName(projectName)
                .build();
        } catch (BusinessException e) {
            return JiraResponse.TestResult.builder()
                .success(false)
                .message("연결 실패: " + e.getMessage())
                .build();
        }
    }

    // ── 매핑 UI용 메타 (상태 목록) ────────────────

    @Transactional
    public JiraResponse.Meta getMeta(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        String token = oauthService.resolveToken(config);

        JsonNode statusGroups = jiraApiClient.getProjectStatuses(
            JiraAuthContext.of(config, token), config.getProjectKey());

        // /project/{key}/statuses = [ {name(issuetype), statuses:[{id,name}]}, ... ] → 유니크 상태로 평탄화
        Map<String, String> uniqueStatuses = new LinkedHashMap<>();
        if (statusGroups != null && statusGroups.isArray()) {
            for (JsonNode group : statusGroups) {
                JsonNode statuses = group.get("statuses");
                if (statuses != null && statuses.isArray()) {
                    for (JsonNode s : statuses) {
                        if (s.hasNonNull("id") && s.hasNonNull("name")) {
                            uniqueStatuses.putIfAbsent(s.get("id").asText(), s.get("name").asText());
                        }
                    }
                }
            }
        }
        List<JiraResponse.NameRef> statusList = new ArrayList<>();
        uniqueStatuses.forEach((id, name) -> statusList.add(JiraResponse.NameRef.builder().id(id).name(name).build()));

        return JiraResponse.Meta.builder().statuses(statusList).build();
    }

    // ── 매핑 규칙 저장 ────────────────────────────

    @Transactional
    public JiraResponse.Status updateMapping(String boardId, String userId, JiraRequest.Mapping request) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.updateMapping(
            toJson(request.getStatusToBlock()),
            toJson(request.getPriorityToTag()),
            toJson(request.getComponentToTag()),
            request.isMilestoneAutoAssign());
        return toStatus(config);
    }

    @Transactional
    public JiraResponse.Status updateWriteBack(String boardId, String userId, JiraRequest.WriteBack request) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.updateWriteBack(request.isEnabled(), request.getTargetStatusId());
        return toStatus(config);
    }

    // ── 상태 조회 / 해제 ──────────────────────────

    public JiraResponse.Status getStatus(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        // pending(OAuth 사이트 미선택) 상태도 반환해야 FE가 사이트 선택 화면을 띄운다
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        return toStatus(config);
    }

    @Transactional
    public void disconnect(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (!configRepository.existsByBoardId(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED);
        }
        issueLinkRepository.deleteByBoardId(boardId);
        userMappingRepository.deleteByBoardId(boardId);
        configRepository.deleteByBoardId(boardId);
        log.info("JIRA disconnected from board {} by user {}", boardId, userId);
    }

    // ── 헬퍼 ──────────────────────────────────────

    private JiraIntegrationConfig getActiveConfigOrThrow(String boardId) {
        return configRepository.findActiveByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
    }

    private String normalizeHost(String baseUrl) {
        return baseUrl.trim().replaceFirst("^https?://", "").replaceAll("/+$", "");
    }

    private String toJson(Map<String, String> map) {
        if (map == null || map.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.JIRA_IMPORT_FAILED, "매핑 직렬화 실패");
        }
    }

    private JiraResponse.Status toStatus(JiraIntegrationConfig c) {
        return JiraResponse.Status.builder()
            .boardId(c.getBoard().getId())
            .connected(Boolean.TRUE.equals(c.getActive()))
            .authType(c.getAuthType() != null ? c.getAuthType().name() : null)
            .needsSiteSelection(c.isOAuth() && !c.isTargetFinalized())
            .baseUrl(c.getBaseUrl())
            .projectKey(c.getProjectKey())
            .jql(c.getJql())
            .status(c.getStatus() != null ? c.getStatus().name() : null)
            .lastSyncedAt(c.getLastSyncedAt() != null ? c.getLastSyncedAt().toString() : null)
            .lastError(c.getLastError())
            .milestoneAutoAssign(Boolean.TRUE.equals(c.getMilestoneAutoAssign()))
            .writeBackEnabled(Boolean.TRUE.equals(c.getWriteBackEnabled()))
            .writeBackTargetStatusId(c.getWriteBackTargetStatusId())
            .connectedByName(c.getConnectedBy() != null ? c.getConnectedBy().getId() : null)
            .build();
    }
}
