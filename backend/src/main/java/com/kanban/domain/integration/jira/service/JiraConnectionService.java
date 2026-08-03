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
import com.kanban.domain.integration.jira.JiraCommentLinkRepository;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.JiraIssueLink;
import com.kanban.domain.integration.jira.JiraIssueLinkRepository;
import com.kanban.domain.integration.jira.JiraLinkTargetType;
import com.kanban.domain.integration.jira.JiraUserMappingRepository;
import com.kanban.domain.integration.jira.dto.JiraRequest;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.task.TaskRepository;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    private final JiraCommentLinkRepository commentLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BlockRepository blockRepository;
    private final TaskRepository taskRepository;
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
        // 미러 컬럼은 jiraStatusId(대표) + jiraStatusIds(묶인 상태 전체) 포함 → FE가 컬럼/배치를 구성.
        MirrorColumns mirror = MirrorColumns.parse(objectMapper, config.getMirrorColumnsJson());
        List<JiraResponse.BlockRef> blockList = blockRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
            .filter(b -> !b.isFeatureBlock())
            .map(b -> JiraResponse.BlockRef.builder()
                .id(b.getId())
                .name(b.getName())
                .fixedType(b.getFixedType() != null ? b.getFixedType().name() : null)
                .jiraStatusId(b.getJiraStatusId())
                .jiraStatusIds(b.isJiraMirror() ? mirror.statusIdsForBlock(b.getId()) : null)
                .build())
            .toList();

        return JiraResponse.Meta.builder().statuses(statusList).blocks(blockList).build();
    }

    /** 반려/재작업 계열 상태 — 이름으로 감지해 '진행 중'(indeterminate)으로 재분류(오분류 방지). */
    private static final java.util.regex.Pattern REJECT_PATTERN = java.util.regex.Pattern.compile(
        "반려|반송|반품|재작업|재오픈|다시\\s*열기|reopen|re-?work|rejected?|declined|sent\\s*back",
        java.util.regex.Pattern.CASE_INSENSITIVE);
    /** 에픽/서브태스크 전용 이슈타입 — 칸반 컬럼 노이즈라 상태 목록에서 제외. */
    private static final java.util.regex.Pattern EPIC_ISSUETYPE_PATTERN = java.util.regex.Pattern.compile(
        "에픽|epic", java.util.regex.Pattern.CASE_INSENSITIVE);

    /**
     * /project/{key}/statuses 를 유니크 상태 목록(등장 순서 유지)으로 평탄화하며 statusCategory를 함께 추출한다.
     * - 에픽/서브태스크 전용 이슈타입 그룹은 스킵(칸반 노이즈 제거). 다른 이슈타입에도 있는 상태는 유지됨.
     * - 반려/재작업 계열 상태명은 statusCategory와 무관하게 '진행 중'(indeterminate)으로 재분류.
     */
    private List<JiraResponse.NameRef> fetchProjectStatuses(JiraIntegrationConfig config, String token) {
        JsonNode statusGroups = jiraApiClient.getProjectStatuses(
            JiraAuthContext.of(config, token), config.getProjectKey());
        Map<String, JiraResponse.NameRef> unique = new LinkedHashMap<>();
        if (statusGroups != null && statusGroups.isArray()) {
            for (JsonNode group : statusGroups) {
                String issueType = group.path("name").asText("");
                boolean subtask = group.path("subtask").asBoolean(false);
                if (subtask || EPIC_ISSUETYPE_PATTERN.matcher(issueType).find()) continue;  // 에픽/서브태스크 필터
                JsonNode statuses = group.get("statuses");
                if (statuses == null || !statuses.isArray()) continue;
                for (JsonNode s : statuses) {
                    if (!s.hasNonNull("id") || !s.hasNonNull("name")) continue;
                    String id = s.get("id").asText();
                    if (unique.containsKey(id)) continue;
                    String name = s.get("name").asText();
                    JsonNode cat = s.path("statusCategory");
                    String catKey = cat.path("key").asText(null);        // new | indeterminate | done
                    String catColor = cat.path("colorName").asText(null);
                    if (REJECT_PATTERN.matcher(name).find()) catKey = "indeterminate";  // 반려 → 진행 중
                    unique.put(id, JiraResponse.NameRef.builder()
                        .id(id).name(name).category(catKey).categoryColor(catColor).build());
                }
            }
        }
        return new ArrayList<>(unique.values());
    }

    /**
     * statusCategory 기준으로 상태들을 3컬럼(할 일·진행 중·완료)으로 그룹핑(전략1 스마트 디폴트).
     * 카테고리 미상은 진행 중으로. 반려 계열은 fetchProjectStatuses에서 이미 진행 중으로 재분류됨.
     * 빈 카테고리는 컬럼을 만들지 않는다.
     */
    private List<ColumnSpec> groupStatusesByCategory(List<JiraResponse.NameRef> statuses) {
        LinkedHashMap<String, List<String>> buckets = new LinkedHashMap<>();
        buckets.put("new", new ArrayList<>());
        buckets.put("indeterminate", new ArrayList<>());
        buckets.put("done", new ArrayList<>());
        Map<String, String> label = Map.of("new", "할 일", "indeterminate", "진행 중", "done", "완료");
        for (JiraResponse.NameRef s : statuses) {
            String cat = s.getCategory();
            if (cat == null || !buckets.containsKey(cat)) cat = "indeterminate";  // 미상 → 진행 중
            buckets.get(cat).add(s.getId());
        }
        List<ColumnSpec> specs = new ArrayList<>();
        buckets.forEach((cat, ids) -> {
            if (!ids.isEmpty()) specs.add(new ColumnSpec(label.get(cat), ids));
        });
        return specs;
    }

    // ── 미러 셋업 (JIRA 상태 → 블록 1:1) ────────────

    /** 셋업용 컬럼 스펙 — 컬럼 이름 + 묶인 JIRA 상태 id들(우선순위 순). */
    private record ColumnSpec(String name, List<String> statusIds) {}

    /**
     * JIRA Agile 보드 컬럼을 그대로 미러 컬럼(블록)으로 재생성하고 미러 모드로 전환.
     * 한 컬럼이 여러 상태를 묶을 수 있고(완료=완료+Resolved), 보드에 없는 상태는 제외한다.
     * 재실행 시 기존 미러 컬럼을 전부 정리(태스크는 TASK 블록으로 대피 후 초기 import가 재배치)하고 새로 만든다.
     * 보드 구성 조회가 실패하면 프로젝트 상태 전체를 상태당 1컬럼으로 폴백.
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

        // 1) 컬럼 스펙 결정: Agile 보드 구성 우선, 실패 시 상태 목록 폴백
        ColumnFetch fetch = fetchBoardColumns(config, token);
        List<ColumnSpec> specs = fetch.specs();
        String columnSource = "BOARD_CONFIG";
        String columnSourceDetail = fetch.detail();
        if (specs.isEmpty()) {
            // 상태 1:1 대신 statusCategory로 3컬럼(할 일·진행 중·완료) 그룹핑(전략1). 반려 계열은 진행 중으로 재분류됨.
            specs = groupStatusesByCategory(fetchProjectStatuses(config, token));
            columnSource = "STATUS_FALLBACK";
            // 폴백 사유: 보드 조회 실패 상세가 있으면 그걸, 없으면 일반 안내.
            columnSourceDetail = fetch.detail() != null ? fetch.detail()
                : "JIRA 보드 구성을 읽지 못해 상태 카테고리(할 일·진행 중·완료)로 컬럼을 구성했습니다.";
        }

        // 2) 기존 미러 컬럼 정리 — 태스크는 TASK 고정 블록으로 대피 후 삭제(초기 import가 새 컬럼으로 재배치)
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK).orElse(null);
        for (Block old : blockRepository.findJiraMirrorBlocksByBoardId(boardId)) {
            if (taskBlock != null) taskRepository.moveTasksToBlock(old.getId(), taskBlock);
            blockRepository.delete(old);
        }
        blockRepository.flush();

        // 3) 컬럼 스펙 → 미러 블록 생성 + mirrorColumnsJson 조립
        int position = 500;
        String[] palette = {"#818cf8", "#6366F1", "#2DD4BF", "#14B8A6", "#10B981", "#F59E0B", "#F43F5E", "#A78BFA"};
        List<Map<String, Object>> mirrorCols = new ArrayList<>();
        int idx = 0;
        for (ColumnSpec spec : specs) {
            if (spec.statusIds().isEmpty()) continue;   // 상태 없는 빈 컬럼은 스킵
            String primary = spec.statusIds().get(0);
            Block mirror = Block.createJiraMirrorBlock(
                board, truncate50(spec.name()), palette[idx % palette.length], position++, primary);
            blockRepository.save(mirror);
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("block_id", mirror.getId());
            col.put("name", spec.name());
            col.put("status_ids", spec.statusIds());
            col.put("primary", primary);
            mirrorCols.add(col);
            idx++;
        }

        config.updateMirrorColumns(toJsonList(mirrorCols));
        config.enableMirror();
        // 초기 가져오기는 이 트랜잭션 밖(컨트롤러)에서 별도로 수행 — 중첩 @Transactional 롤백 오염 방지.

        // 과거 연결 사이클에서 unlink된 잉여(고아) 미러 블록 청소 — 빈 것만.
        Set<String> newColumnNames = new HashSet<>();
        for (Map<String, Object> c : mirrorCols) newColumnNames.add((String) c.get("name"));
        cleanupOrphanMirrorBlocks(boardId, newColumnNames, config, token);

        int total = mirrorCols.size();
        log.info("JIRA mirror setup for board {}: {} columns, source={}, detail={}, by user {}",
            boardId, total, columnSource, columnSourceDetail, userId);

        return JiraResponse.MirrorSetup.builder()
            .columns(total)
            .created(total)
            .reused(0)
            .status(toStatus(config))
            .columnSource(columnSource)
            .columnSourceDetail(columnSourceDetail)
            .build();
    }

    /** 컬럼 조회 결과 — specs(빈 목록이면 폴백 필요)와 사유/출처 상세. */
    private record ColumnFetch(List<ColumnSpec> specs, String detail) {
        static ColumnFetch ok(List<ColumnSpec> specs, String detail) { return new ColumnFetch(specs, detail); }
        static ColumnFetch fail(String detail) { return new ColumnFetch(List.of(), detail); }
    }

    /**
     * Agile 보드 구성에서 컬럼(이름+상태 id들)을 뽑는다. 실패하면 빈 specs + 사유 detail을 반환해
     * 셋업에서 상태 목록으로 폴백하되 사용자에게 이유를 노출한다.
     */
    private ColumnFetch fetchBoardColumns(JiraIntegrationConfig config, String token) {
        String boardIdJira;
        try {
            JiraAuthContext ctx = JiraAuthContext.of(config, token);
            // 사용자가 미러 대상 보드를 골랐으면 그 보드를 사용, 없으면 자동 선택(첫 kanban 보드).
            boardIdJira = config.getAgileBoardId();
            if (boardIdJira == null || boardIdJira.isBlank()) {
                boardIdJira = autoPickAgileBoardId(ctx, config.getProjectKey());
                if (boardIdJira == null) {
                    return ColumnFetch.fail("프로젝트 '" + config.getProjectKey()
                        + "'에 연결된 JIRA Agile 보드를 찾지 못했습니다. (보드 미선택 + 자동탐색 실패)");
                }
            }

            JsonNode cfg = jiraApiClient.getBoardConfiguration(ctx, boardIdJira);
            if (cfg == null) {
                return ColumnFetch.fail("보드 " + boardIdJira + " 구성 응답이 비어 있습니다.");
            }
            JsonNode columns = cfg.path("columnConfig").path("columns");
            if (!columns.isArray() || columns.isEmpty()) {
                return ColumnFetch.fail("보드 " + boardIdJira + "에 컬럼 구성(columnConfig)이 없습니다. "
                    + "칸반 보드가 맞는지, 접근 권한이 있는지 확인하세요.");
            }

            List<ColumnSpec> specs = new ArrayList<>();
            for (JsonNode col : columns) {
                String name = col.path("name").asText(null);
                List<String> statusIds = new ArrayList<>();
                JsonNode sts = col.get("statuses");
                if (sts != null && sts.isArray()) {
                    for (JsonNode s : sts) {
                        String id = s.path("id").asText(null);
                        if (id != null) statusIds.add(id);
                    }
                }
                if (name != null && !statusIds.isEmpty()) specs.add(new ColumnSpec(name, statusIds));
            }
            if (specs.isEmpty()) {
                return ColumnFetch.fail("보드 " + boardIdJira + " 컬럼에 매핑된 JIRA 상태가 없습니다.");
            }
            String boardName = cfg.path("name").asText(boardIdJira);
            return ColumnFetch.ok(specs, "JIRA 보드 '" + boardName + "' 구성");
        } catch (Exception e) {
            log.warn("JIRA agile board config fetch failed for {}: {} — falling back to status list",
                config.getProjectKey(), e.getMessage());
            return ColumnFetch.fail("JIRA 보드 구성 조회 실패: " + e.getMessage());
        }
    }

    /** 프로젝트의 Agile 보드 중 자동으로 하나 선택 — kanban 우선, 없으면 첫 보드. 실패 시 null. */
    private String autoPickAgileBoardId(JiraAuthContext ctx, String projectKey) {
        JsonNode boards = jiraApiClient.getAgileBoards(ctx, projectKey);
        JsonNode values = boards != null ? boards.get("values") : null;
        if (values == null || !values.isArray() || values.isEmpty()) return null;
        for (JsonNode b : values) {
            if ("kanban".equalsIgnoreCase(b.path("type").asText(""))) {
                return b.path("id").asText(null);
            }
        }
        return values.get(0).path("id").asText(null);
    }

    /** 미러 대상으로 고를 수 있는 프로젝트의 Agile 보드 목록. 현재 선택된 보드를 selected로 표시. */
    @Transactional(readOnly = true)
    public List<JiraResponse.AgileBoard> listAgileBoards(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        String token = oauthService.resolveToken(config);
        String selectedId = config.getAgileBoardId();
        List<JiraResponse.AgileBoard> result = new ArrayList<>();
        try {
            JiraAuthContext ctx = JiraAuthContext.of(config, token);
            JsonNode boards = jiraApiClient.getAgileBoards(ctx, config.getProjectKey());
            JsonNode values = boards != null ? boards.get("values") : null;
            if (values != null && values.isArray()) {
                for (JsonNode b : values) {
                    String id = b.path("id").asText(null);
                    if (id == null) continue;
                    result.add(JiraResponse.AgileBoard.builder()
                        .id(id)
                        .name(b.path("name").asText(""))
                        .type(b.path("type").asText(""))
                        .selected(id.equals(selectedId))
                        .build());
                }
            }
        } catch (Exception e) {
            log.warn("JIRA agile board list fetch failed for {}: {}", config.getProjectKey(), e.getMessage());
        }
        return result;
    }

    /** 미러 대상 Agile 보드 저장. 셋업/재동기화 시 이 보드의 컬럼을 미러링. */
    @Transactional
    public JiraResponse.Status selectAgileBoard(String boardId, String userId, String agileBoardId) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.updateAgileBoardId(agileBoardId);
        return toStatus(config);
    }

    private String toJsonList(List<Map<String, Object>> list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.JIRA_IMPORT_FAILED, "미러 컬럼 직렬화 실패");
        }
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

    /**
     * 과거 연결 사이클에서 unlink(jiraStatusId=null)된 채 남은 잉여 미러 블록을 청소한다.
     * 안전 조건(전부 충족해야 삭제): 비고정 · 비Feature · 현재 미러 아님(jiraStatusId=null) ·
     * 이름이 JIRA 상태명/카테고리 라벨/현재 컬럼명과 일치 · 카드 0개(빈 블록).
     * 카드가 있는 블록·고정 블록·사용자 커스텀 블록은 건드리지 않는다.
     */
    private void cleanupOrphanMirrorBlocks(String boardId, Set<String> currentColumnNames,
                                           JiraIntegrationConfig config, String token) {
        Set<String> mirrorNames = new HashSet<>(currentColumnNames);
        mirrorNames.add("할 일");
        mirrorNames.add("진행 중");
        mirrorNames.add("완료");
        try {
            for (JiraResponse.NameRef s : fetchProjectStatuses(config, token)) mirrorNames.add(s.getName());
        } catch (Exception e) {
            log.warn("고아 블록 청소용 상태 목록 조회 실패 board={}: {}", boardId, e.getMessage());
        }
        int removed = 0;
        for (Block b : blockRepository.findByBoardIdOrderByPositionAsc(boardId)) {
            if (b.getFixedType() != null || b.isFeatureBlock() || b.isJiraMirror()) continue;
            if (!mirrorNames.contains(b.getName())) continue;
            if (taskRepository.findMaxPositionByBlockId(b.getId()) != null) continue;  // 카드 있으면 보존
            blockRepository.delete(b);
            removed++;
        }
        if (removed > 0) {
            blockRepository.flush();
            log.info("Removed {} orphan JIRA mirror blocks on board {}", removed, boardId);
        }
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

    /**
     * 댓글 양방향 동기화 on/off.
     *
     * <p>켠 뒤 JIRA→BRIDGE를 실시간으로 받으려면 JIRA 웹훅/Automation에 코멘트 이벤트
     * ({@code comment_created}, {@code comment_deleted})를 추가해야 한다. 없으면 폴링 백업으로만 들어와
     * 최대 2분 지연되고, 삭제는 대조 시점까지 반영되지 않는다.
     */
    @Transactional
    public JiraResponse.Status updateCommentSync(String boardId, String userId, JiraRequest.CommentSync request) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = getActiveConfigOrThrow(boardId);
        config.updateCommentSync(request.isEnabled());
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
        // 미러 컬럼 삭제 — 태스크는 TASK 고정 블록으로 대피(카드 보존).
        // (unlink 후 블록을 남기면 jiraStatusId=null이 되어 재연결 시 청소 대상에서 빠져 잉여 블록이 누적됨.)
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK).orElse(null);
        for (Block mirror : blockRepository.findJiraMirrorBlocksByBoardId(boardId)) {
            if (taskBlock != null) taskRepository.moveTasksToBlock(mirror.getId(), taskBlock);
            blockRepository.delete(mirror);
        }
        blockRepository.flush();
        issueLinkRepository.deleteByBoardId(boardId);
        commentLinkRepository.deleteByBoardId(boardId);
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
            .commentSyncEnabled(c.isCommentSyncEnabled())
            .blockStatusMap(readNested(c.getBlockStatusMapJson()))
            .webhookToken(c.getWebhookToken())
            .connectedByName(c.getConnectedBy() != null ? c.getConnectedBy().getId() : null)
            .syncMode(c.getSyncMode() != null ? c.getSyncMode().name() : null)
            .mirrorReady(c.isMirror() && blockRepository.countJiraMirrorBlocksByBoardId(c.getBoard().getId()) > 0)
            .agileBoardId(c.getAgileBoardId())
            .build();
    }
}
