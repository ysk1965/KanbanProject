package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.jira.JiraAuthType;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.JiraIssueLink;
import com.kanban.domain.integration.jira.JiraIssueLinkRepository;
import com.kanban.domain.integration.jira.JiraLinkTargetType;
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
import org.springframework.cache.annotation.CacheEvict;
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
    private final JiraImportService importService;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BlockRepository blockRepository;
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
        config.ensureWebhookToken();   // 패널 진입 시 웹훅 토큰 보장(멱등)
        String token = oauthService.resolveToken(config);

        List<JiraResponse.NameRef> statusList = fetchProjectStatuses(config, token);

        // 매핑 UI 좌측: BRIDGE 블록 (Feature 블록 제외 — 카드가 흐르는 칸반 블록만).
        // jiraStatusId 포함 → FE가 미러 컬럼을 식별.
        List<JiraResponse.BlockRef> blockList = blockRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
            .filter(b -> !b.isFeatureBlock())
            .map(b -> JiraResponse.BlockRef.builder()
                .id(b.getId())
                .name(b.getName())
                .fixedType(b.getFixedType() != null ? b.getFixedType().name() : null)
                .jiraStatusId(b.getJiraStatusId())
                .build())
            .toList();

        return JiraResponse.Meta.builder().statuses(statusList).blocks(blockList).build();
    }

    /** /project/{key}/statuses 를 유니크 상태 목록(등장 순서 유지)으로 평탄화. */
    private List<JiraResponse.NameRef> fetchProjectStatuses(JiraIntegrationConfig config, String token) {
        JsonNode statusGroups = jiraApiClient.getProjectStatuses(
            JiraAuthContext.of(config, token), config.getProjectKey());
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
        return statusList;
    }

    // ── 미러 셋업 (JIRA 상태 → 블록 1:1) ────────────

    /**
     * JIRA 상태별로 미러 컬럼(블록)을 생성하고 미러 모드로 전환. 멱등 — 이미 있는 미러 컬럼은 재사용.
     * 미러 블록은 JIRA 뷰 전용(메인 보드에서 숨김)이며 jiraStatusId로 식별된다.
     */
    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
    public JiraResponse.MirrorSetup setupMirror(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.ensureWebhookToken();
        String token = oauthService.resolveToken(config);
        Board board = boardRepository.findById(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<JiraResponse.NameRef> statuses = fetchProjectStatuses(config, token);

        // 미러 컬럼은 메인 보드 정상 블록(0..~)과 위치 충돌을 피하려고 500번대에 배치. DONE(999) 앞.
        int position = 500;
        int created = 0, reused = 0;
        String[] palette = {"#818cf8", "#6366F1", "#2DD4BF", "#14B8A6", "#10B981", "#F59E0B", "#F43F5E", "#A78BFA"};
        int idx = 0;
        for (JiraResponse.NameRef st : statuses) {
            Block existing = blockRepository.findByBoardIdAndJiraStatusId(boardId, st.getId()).orElse(null);
            if (existing != null) {
                reused++;
            } else {
                String color = palette[idx % palette.length];
                Block mirror = Block.createJiraMirrorBlock(board, truncate50(st.getName()), color, position++, st.getId());
                blockRepository.save(mirror);
                created++;
            }
            idx++;
        }

        config.enableMirror();

        // 미러 컬럼이 채워지도록 초기 가져오기(멱등). 실패해도 셋업 자체는 성공 처리.
        try {
            importService.importIssues(boardId, userId, new JiraRequest.Import(null, false));
        } catch (Exception e) {
            log.warn("JIRA mirror setup: initial import failed for board {}: {}", boardId, e.getMessage());
        }

        long total = blockRepository.countJiraMirrorBlocksByBoardId(boardId);
        log.info("JIRA mirror setup for board {}: {} columns ({} created, {} reused) by user {}",
            boardId, total, created, reused, userId);

        return JiraResponse.MirrorSetup.builder()
            .columns((int) total)
            .created(created)
            .reused(reused)
            .status(toStatus(config))
            .build();
    }

    // ── pre-block: 태스크의 전환 가능 상태 ──────────

    /** 특정 태스크(=JIRA 이슈)에서 전환 가능한 JIRA 상태 id 목록. FE 드래그 시 유효 컬럼만 활성화. */
    @Transactional
    public JiraResponse.Transitions getTaskTransitions(String boardId, String userId, String taskId) {
        boardService.checkViewerOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        JiraIssueLink link = issueLinkRepository
            .findByTargetTypeAndTargetId(JiraLinkTargetType.TASK, taskId).orElse(null);
        List<String> allowed = new ArrayList<>();
        String currentStatusId = null;
        if (link != null) {
            currentStatusId = link.getLastJiraStatusId();
            try {
                String token = oauthService.resolveToken(config);
                JsonNode result = jiraApiClient.getTransitions(JiraAuthContext.of(config, token), link.getJiraIssueKey());
                JsonNode transitions = result != null ? result.get("transitions") : null;
                if (transitions != null && transitions.isArray()) {
                    for (JsonNode tr : transitions) {
                        String toId = tr.path("to").path("id").asText(null);
                        if (toId != null && !allowed.contains(toId)) allowed.add(toId);
                    }
                }
            } catch (Exception e) {
                log.warn("JIRA transitions fetch failed for task {}: {}", taskId, e.getMessage());
            }
            if (currentStatusId != null && !allowed.contains(currentStatusId)) allowed.add(currentStatusId);
        }
        return JiraResponse.Transitions.builder()
            .taskId(taskId)
            .currentStatusId(currentStatusId)
            .allowedStatusIds(allowed)
            .build();
    }

    private String truncate50(String s) {
        if (s == null) return "";
        return s.length() > 50 ? s.substring(0, 50) : s;
    }

    // ── 블록↔status 양방향 매핑 저장 ────────────────

    @Transactional
    public JiraResponse.Status updateBlockStatusMap(String boardId, String userId, JiraRequest.BlockStatusMapping request) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.updateBlockStatusMap(toJsonNested(request.getBlockStatusMap()));
        return toStatus(config);
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
    @CacheEvict(value = "blocks", allEntries = true)
    public void disconnect(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (!configRepository.existsByBoardId(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED);
        }
        // 미러 컬럼은 삭제하지 않고 일반 블록으로 전환(연동 해제해도 카드/컬럼 보존, 메인 보드에 노출).
        blockRepository.findJiraMirrorBlocksByBoardId(boardId).forEach(Block::unlinkJiraStatus);
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

    private String toJsonNested(Map<String, Map<String, String>> map) {
        if (map == null || map.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.JIRA_IMPORT_FAILED, "매핑 직렬화 실패");
        }
    }

    private Map<String, Map<String, String>> readNested(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Map<String, String>>>() {});
        } catch (Exception e) {
            return null;
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
            .blockStatusMap(readNested(c.getBlockStatusMapJson()))
            .webhookToken(c.getWebhookToken())
            .connectedByName(c.getConnectedBy() != null ? c.getConnectedBy().getId() : null)
            .syncMode(c.getSyncMode() != null ? c.getSyncMode().name() : null)
            .mirrorReady(c.isMirror() && blockRepository.countJiraMirrorBlocksByBoardId(c.getBoard().getId()) > 0)
            .build();
    }
}
