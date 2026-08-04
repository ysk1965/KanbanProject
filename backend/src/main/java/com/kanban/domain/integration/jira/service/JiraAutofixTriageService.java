package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.config.ClaudeAIProvider;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 자동수정 트리아지 — JIRA 연동 이슈가 <b>자동 검증 가능한지</b> 판정한다.
 *
 * <p>자동수정 파이프라인의 1단계. 여기서 나오는 "후보 몇 건" 숫자로 파이프라인 자체를 지을지 결정하므로,
 * 이 서비스는 판정과 집계까지만 하고 수정·PR은 건드리지 않는다.
 *
 * <p>판정 기준은 "AI가 고칠 수 있는가"가 아니라 "고쳐졌음을 자동으로 검증할 수 있는가"다. 전자로 잡으면
 * 컴파일만 통과하는 PR이 쌓이고, 결국 사람이 전건을 손으로 확인하게 되어 자동화 이득이 사라진다.
 *
 * <p>{@code ai.provider} 값과 무관하게 항상 Claude로 간다 — {@link ClaudeAIProvider}를 구체 타입으로
 * 주입하기 때문이다. structured outputs가 OpenAI 경로에 없어 스키마 보장이 깨진다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraAutofixTriageService {

    /** 한 번의 AI 호출에 넣을 이슈 수. 크게 잡으면 호출은 줄지만 판정 품질이 흐려진다. */
    private static final int BATCH_SIZE = 15;

    private static final int MAX_TOKENS = 8192;
    private static final int TITLE_CLIP = 200;
    private static final int DESC_CLIP = 1500;

    private static final String FEATURE_TYPE = "JIRA_AUTOFIX_TRIAGE";

    private final ClaudeAIProvider claudeAIProvider;
    private final ObjectMapper objectMapper;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final TaskRepository taskRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraAutofixTriageRepository triageRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;

    @Value("${ai.claude.model.jira-triage:claude-sonnet-5}")
    private String model;

    private static final List<String> VERDICT_VALUES =
            List.of("CANDIDATE", "CONDITIONAL", "EXCLUDED");

    private static final List<String> CATEGORY_VALUES =
            List.of("TEXT", "NULL_GUARD", "CONSTANT", "LOGIC", "UI_STATE", "ASSET", "DESIGN_INTENT", "OTHER");

    /** 출력 스키마. structured outputs로 강제되므로 파싱 실패가 없다. */
    private static final Map<String, Object> OUTPUT_SCHEMA = Map.of(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("results"),
            "properties", Map.of(
                    "results", Map.of(
                            "type", "array",
                            "items", Map.of(
                                    "type", "object",
                                    "additionalProperties", false,
                                    "required", List.of("issue_key", "verdict", "category",
                                            "confidence", "verification", "reason"),
                                    "properties", Map.of(
                                            "issue_key", Map.of("type", "string"),
                                            "verdict", Map.of("type", "string", "enum", VERDICT_VALUES),
                                            "category", Map.of("type", "string", "enum", CATEGORY_VALUES),
                                            "confidence", Map.of("type", "number"),
                                            "verification", Map.of("type", "string"),
                                            "reason", Map.of("type", "string")
                                    )
                            )
                    )
            )
    );

    /**
     * 저장소의 검증 기반 수준별 프롬프트 조각. 이게 빠지면 모델은 테스트가 갖춰진 저장소를
     * 가정하고 낙관적으로 판정한다 — 실제로 테스트가 0개인 저장소에서 후보가 부풀어 오른다.
     */
    private static final Map<TestInfraLevel, String> TEST_INFRA_PROMPT = Map.of(
            TestInfraLevel.NONE, """
                    <repo_reality>
                    중요: 이 저장소에는 자동 테스트 코드가 전혀 없다. 테스트 어셈블리도 없다.
                    따라서 "EditMode 테스트를 작성하면 된다"는 검증 수단으로 인정하지 않는다 —
                    테스트 기반 자체를 새로 만들어야 하는 일이고, 그 테스트가 옳은지는 아무도 검증하지 않는다.

                    이 저장소에서 지금 실제로 성립하는 검증 수단은 이것뿐이다:
                    - 컴파일 통과 (문법·타입 오류만 잡는다. 동작은 보장하지 않는다)
                    - 문자열·상수 값의 정적 대조 (기대값이 이슈에 명시된 경우에 한함)

                    그래서 CANDIDATE는 "코드를 읽어 기대값과 실제값의 불일치가 확정되고, 고친 뒤
                    그 값이 맞다는 걸 코드만 봐도 아는" 극히 좁은 범위에만 준다. 확신이 없으면 CONDITIONAL 이하로 내린다.
                    </repo_reality>
                    """,
            TestInfraLevel.PARTIAL, """
                    <repo_reality>
                    이 저장소에는 일부 영역에만 테스트가 있다. 이슈가 건드리는 영역에 이미 테스트가 있다면
                    그것을 검증 수단으로 인정한다. 테스트가 없는 영역이면 새로 만들어야 하므로 CONDITIONAL 이하로 판정한다.
                    </repo_reality>
                    """,
            TestInfraLevel.MATURE, """
                    <repo_reality>
                    이 저장소는 테스트 기반이 갖춰져 있고 CI에서 EditMode/PlayMode 테스트가 돈다.
                    기존 테스트 확장이나 신규 테스트 작성을 정상적인 검증 수단으로 인정한다.
                    </repo_reality>
                    """
    );

    private static final String SYSTEM_PROMPT_TEMPLATE = """
            너는 Unity 게임 프로젝트의 QA 이슈를 분류하는 트리아지 담당이다.
            각 이슈가 AI 코딩 에이전트에게 맡겨 자동으로 고칠 수 있는 건인지 판정한다.

            판정 기준은 단 하나다: <b>고쳐졌다는 것을 사람 눈 없이 자동으로 검증할 수 있는가.</b>
            "AI가 코드를 고칠 수 있을 것 같다"는 기준이 아니다. 검증 수단이 없으면 EXCLUDED다.
            게임을 실행해 화면을 봐야 알 수 있는 건 검증 수단이 아니다.

            %s

            <verdict>
            - CANDIDATE: 이슈 본문만으로 기대 동작이 확정되고, 위 검증 수단 중 하나를 바로 쓸 수 있다
            - CONDITIONAL: 재현 절차나 기대 사양이 이슈에 추가되면 검증 가능해진다
            - EXCLUDED: 시각 확인이나 기획 의도 판단이 필요해 자동 검증이 원리적으로 불가능하다
            </verdict>

            <category>
            TEXT(문구·오탈자·표현 혼용) / NULL_GUARD(널 체크 누락·예외) / CONSTANT(하드코딩 상수·밸런스)
            LOGIC(계산 로직·보상·확률) / UI_STATE(UI 갱신 지연·상태 미반영) / ASSET(아이콘·이펙트 표시)
            DESIGN_INTENT(기획 판단 필요) / OTHER
            </category>

            <rules>
            - 입력에 준 이슈 전부에 대해 정확히 하나씩 결과를 낸다. 이슈키를 그대로 반환한다
            - confidence는 판정 자체에 대한 확신도(0.0~1.0)다. 수정 성공 확률이 아니다
            - 애매하면 낮은 쪽으로 판정한다. 놓친 후보보다 잘못 태운 후보의 비용이 훨씬 크다
            - verification은 구체적인 검증 수단 한 줄. EXCLUDED면 왜 불가능한지 한 줄
            - reason은 판정 근거 한 줄. 이슈 내용을 요약하지 말고 판정 이유를 쓴다
            - verification과 reason은 한국어로 쓴다
            </rules>
            """;

    // ── 실행 ──────────────────────────────────────

    /**
     * 보드의 JIRA 연동 이슈를 트리아지한다.
     *
     * <p>클래스 전체에 트랜잭션을 걸지 않는다 — 배치마다 수 초짜리 HTTP 호출이 있어 커넥션을
     * 잡고 있으면 안 된다. 저장은 배치 단위로 {@code saveAll}이 각자의 트랜잭션에서 처리한다.
     * 중간에 실패해도 거기까지의 판정은 남는다.
     *
     * @param force true면 이슈가 안 바뀌었어도 전건 재판정
     */
    public JiraAutofixResponse.TriageRun triageBoard(String boardId, String userId, boolean force) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<JiraIssueLink> links = issueLinkRepository
                .findByBoardIdAndTargetType(boardId, JiraLinkTargetType.TASK).stream()
                .filter(link -> !link.isJiraDeleted())
                .toList();

        if (links.isEmpty()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_NO_LINKED_ISSUES);
        }

        Map<String, JiraAutofixTriage> existing = new HashMap<>();
        for (JiraAutofixTriage triage : triageRepository.findByBoardId(boardId)) {
            existing.put(triage.getJiraIssueKey(), triage);
        }

        List<JiraIssueLink> targets = links.stream()
                .filter(link -> {
                    if (force) return true;
                    JiraAutofixTriage prior = existing.get(link.getJiraIssueKey());
                    return prior == null || prior.isStaleAgainst(link.getJiraUpdatedAt());
                })
                .toList();

        int skipped = links.size() - targets.size();

        // 저장소에 어떤 검증 수단이 실제로 있는지가 판정을 좌우한다 — 없는 테스트를 전제하면 후보가 부푼다
        TestInfraLevel testInfra = configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::resolveAutofixTestInfra)
                .orElse(TestInfraLevel.NONE);
        String systemPrompt = buildSystemPrompt(testInfra);

        log.info("JIRA autofix triage: board={} scanned={} targets={} skipped={} testInfra={}",
                boardId, links.size(), targets.size(), skipped, testInfra);

        Map<String, Task> tasks = loadTasks(targets);

        int triaged = 0;
        int failedBatches = 0;

        for (int from = 0; from < targets.size(); from += BATCH_SIZE) {
            List<JiraIssueLink> batch = targets.subList(from, Math.min(from + BATCH_SIZE, targets.size()));
            try {
                triaged += triageBatch(board, userId, batch, tasks, existing, systemPrompt);
            } catch (Exception e) {
                // 한 배치가 죽어도 나머지는 계속 간다 — 100건 중 15건 때문에 전부 날리지 않는다
                failedBatches++;
                log.warn("JIRA autofix triage batch failed (board={}, from={}): {}",
                        boardId, from, e.getMessage());
            }
        }

        return JiraAutofixResponse.TriageRun.builder()
                .scanned(links.size())
                .triaged(triaged)
                .skipped(skipped)
                .failedBatches(failedBatches)
                .summary(buildSummary(boardId))
                .build();
    }

    /** 저장소 검증 기반 수준을 프롬프트에 박아 넣는다. */
    private String buildSystemPrompt(TestInfraLevel level) {
        return SYSTEM_PROMPT_TEMPLATE.formatted(
                TEST_INFRA_PROMPT.getOrDefault(level, TEST_INFRA_PROMPT.get(TestInfraLevel.NONE)));
    }

    /** 배치 1건 판정 + 저장. 반환값은 실제로 반영된 건수. */
    private int triageBatch(Board board, String userId, List<JiraIssueLink> batch,
                            Map<String, Task> tasks, Map<String, JiraAutofixTriage> existing,
                            String systemPrompt) {

        List<JiraIssueLink> withContent = batch.stream()
                .filter(link -> {
                    Task task = tasks.get(link.getTargetId());
                    return task != null && task.getTitle() != null && !task.getTitle().isBlank();
                })
                .toList();

        if (withContent.isEmpty()) return 0;

        // 기존 AI 기능과 동일하게 호출 전에 차감한다(ChecklistAIService 패턴)
        aiCreditService.consumeCredit(board.getId(), userId, FEATURE_TYPE, 1);

        ClaudeAIProvider.StructuredResponse response = claudeAIProvider.chatStructured(
                systemPrompt, buildUserPrompt(withContent, tasks), model, MAX_TOKENS, OUTPUT_SCHEMA);

        recordUsage(board.getId(), userId, response);

        if ("refusal".equals(response.stopReason())) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_TRIAGE_FAILED);
        }
        if ("max_tokens".equals(response.stopReason())) {
            // 배치 크기를 줄여야 한다는 신호. 이 배치만 실패 처리하고 넘어간다.
            log.warn("JIRA autofix triage truncated — consider lowering BATCH_SIZE");
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_TRIAGE_FAILED);
        }
        if (response.json() == null || response.json().isBlank()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_TRIAGE_FAILED);
        }

        JsonNode results;
        try {
            results = objectMapper.readTree(response.json()).path("results");
        } catch (Exception e) {
            // structured outputs가 보장하므로 정상적으로는 도달하지 않는다
            log.error("Failed to parse triage JSON: {}", e.getMessage());
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_TRIAGE_FAILED);
        }

        Map<String, JiraIssueLink> byKey = new HashMap<>();
        withContent.forEach(link -> byKey.put(link.getJiraIssueKey(), link));

        List<JiraAutofixTriage> toSave = new ArrayList<>();
        for (JsonNode node : results) {
            String key = node.path("issue_key").asText(null);
            JiraIssueLink link = key != null ? byKey.get(key) : null;
            if (link == null) {
                // 모델이 없는 이슈키를 만들어냈거나 다른 배치 것을 반환한 경우
                log.debug("Triage returned unknown issue key: {}", key);
                continue;
            }

            AutofixVerdict verdict = parseVerdict(node.path("verdict").asText(null));
            AutofixCategory category = parseCategory(node.path("category").asText(null));
            double confidence = clampConfidence(node.path("confidence").asDouble(0.0));
            String verification = clip(node.path("verification").asText(null), 500);
            String reason = clip(node.path("reason").asText(null), 1000);

            JiraAutofixTriage prior = existing.get(key);
            if (prior != null) {
                prior.applyVerdict(verdict, category, confidence, verification, reason,
                        link.getJiraUpdatedAt(), model, link.getTargetId());
                toSave.add(prior);
            } else {
                JiraAutofixTriage created = JiraAutofixTriage.builder()
                        .board(link.getBoard())
                        .jiraIssueKey(key)
                        .taskId(link.getTargetId())
                        .verdict(verdict)
                        .category(category)
                        .confidence(confidence)
                        .verification(verification)
                        .reason(reason)
                        .jiraUpdatedAt(link.getJiraUpdatedAt())
                        .model(model)
                        .build();
                existing.put(key, created);
                toSave.add(created);
            }
        }

        triageRepository.saveAll(toSave);
        return toSave.size();
    }

    // ── 조회 ──────────────────────────────────────

    @Transactional(readOnly = true)
    public JiraAutofixResponse.Summary getSummary(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        return buildSummary(boardId);
    }

    /** 현재 설정된 저장소 검증 기반 수준. UI 초기값. */
    @Transactional(readOnly = true)
    public String getTestInfra(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        return configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::resolveAutofixTestInfra)
                .orElse(TestInfraLevel.NONE)
                .name();
    }

    /**
     * 저장소 검증 기반 수준을 바꾼다. 판정 기준이 통째로 달라지므로 기존 판정은 무의미해진다 —
     * 다음 실행에서 전건 재판정되도록 판정 이력을 비운다.
     */
    @Transactional
    public String updateTestInfra(String boardId, String userId, String level) {
        boardService.checkAdminOrAbove(boardId, userId);

        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));

        TestInfraLevel resolved = TestInfraLevel.fromOrDefault(level);
        if (resolved != config.resolveAutofixTestInfra()) {
            config.updateAutofixTestInfra(resolved);
            triageRepository.deleteByBoardId(boardId);
            log.info("JIRA autofix test-infra changed to {} for board {} — prior verdicts cleared",
                    resolved, boardId);
        }
        return resolved.name();
    }

    /** 판정별 목록. verdict가 null이면 전건. */
    @Transactional(readOnly = true)
    public List<JiraAutofixResponse.TriageItem> getItems(String boardId, String userId, String verdict) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<JiraAutofixTriage> rows;
        if (verdict == null || verdict.isBlank()) {
            rows = triageRepository.findByBoardId(boardId);
        } else {
            rows = triageRepository.findByBoardIdAndVerdict(boardId, parseVerdict(verdict));
        }

        return rows.stream()
                .sorted(Comparator.comparingDouble(
                        (JiraAutofixTriage t) -> t.getConfidence() == null ? 0.0 : t.getConfidence()).reversed())
                .map(t -> JiraAutofixResponse.TriageItem.builder()
                        .jiraIssueKey(t.getJiraIssueKey())
                        .taskId(t.getTaskId())
                        .verdict(t.getVerdict().name())
                        .category(t.getCategory().name())
                        .confidence(t.getConfidence())
                        .verification(t.getVerification())
                        .reason(t.getReason())
                        .triagedAt(t.getUpdatedAt() != null ? t.getUpdatedAt().toString() : null)
                        .build())
                .toList();
    }

    private JiraAutofixResponse.Summary buildSummary(String boardId) {
        Map<AutofixCategory, int[]> byCategory = new EnumMap<>(AutofixCategory.class);
        int candidate = 0, conditional = 0, excluded = 0;

        for (Object[] row : triageRepository.countByVerdictAndCategory(boardId)) {
            AutofixVerdict verdict = (AutofixVerdict) row[0];
            AutofixCategory category = (AutofixCategory) row[1];
            int count = ((Number) row[2]).intValue();

            int[] slot = byCategory.computeIfAbsent(category, k -> new int[3]);
            switch (verdict) {
                case CANDIDATE -> { slot[0] += count; candidate += count; }
                case CONDITIONAL -> { slot[1] += count; conditional += count; }
                case EXCLUDED -> { slot[2] += count; excluded += count; }
            }
        }

        int total = candidate + conditional + excluded;
        List<JiraAutofixResponse.CategoryCount> categories = byCategory.entrySet().stream()
                .map(entry -> {
                    int[] slot = entry.getValue();
                    return JiraAutofixResponse.CategoryCount.builder()
                            .category(entry.getKey().name())
                            .candidate(slot[0])
                            .conditional(slot[1])
                            .excluded(slot[2])
                            .total(slot[0] + slot[1] + slot[2])
                            .build();
                })
                .sorted(Comparator.comparingInt(JiraAutofixResponse.CategoryCount::getTotal).reversed())
                .toList();

        double ratio = total == 0 ? 0.0 : Math.round(candidate * 10000.0 / total) / 100.0;

        return JiraAutofixResponse.Summary.builder()
                .total(total)
                .candidate(candidate)
                .conditional(conditional)
                .excluded(excluded)
                .candidateRatio(ratio)
                .categories(categories)
                .build();
    }

    // ── 내부 헬퍼 ──────────────────────────────────

    private Map<String, Task> loadTasks(List<JiraIssueLink> links) {
        List<String> ids = links.stream().map(JiraIssueLink::getTargetId).distinct().toList();
        Map<String, Task> map = new HashMap<>();
        for (Task task : taskRepository.findAllById(ids)) {
            map.put(task.getId(), task);
        }
        return map;
    }

    private String buildUserPrompt(List<JiraIssueLink> links, Map<String, Task> tasks) {
        StringBuilder sb = new StringBuilder();
        sb.append("아래 이슈들을 각각 판정하라. 총 ").append(links.size()).append("건이다.\n\n");

        for (JiraIssueLink link : links) {
            Task task = tasks.get(link.getTargetId());
            sb.append("=== ").append(link.getJiraIssueKey()).append(" ===\n");
            sb.append("제목: ").append(clip(task.getTitle(), TITLE_CLIP)).append('\n');

            String description = task.getDescription();
            sb.append("본문: ")
              .append(description == null || description.isBlank()
                      ? "(없음)" : clip(description, DESC_CLIP))
              .append("\n\n");
        }
        return sb.toString();
    }

    private AutofixVerdict parseVerdict(String value) {
        try {
            return AutofixVerdict.valueOf(value);
        } catch (Exception e) {
            // 스키마 enum으로 막히지만, 조회 파라미터로도 들어오는 경로라 방어한다
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_INVALID_VERDICT);
        }
    }

    private AutofixCategory parseCategory(String value) {
        try {
            return AutofixCategory.valueOf(value);
        } catch (Exception e) {
            return AutofixCategory.OTHER;
        }
    }

    private double clampConfidence(double value) {
        if (Double.isNaN(value)) return 0.0;
        return Math.max(0.0, Math.min(1.0, value));
    }

    private String clip(String value, int limit) {
        if (value == null) return null;
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private void recordUsage(String boardId, String userId, ClaudeAIProvider.StructuredResponse response) {
        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId)
                    .userId(userId)
                    .featureType(FEATURE_TYPE)
                    .provider("claude")
                    .model(response.model())
                    .inputTokens(response.inputTokens())
                    .outputTokens(response.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(
                            response.model(), response.inputTokens(), response.outputTokens()))
                    .creditsUsed(1)
                    .build());
        } catch (Exception e) {
            log.error("Failed to record triage usage: {}", e.getMessage());
        }
    }
}
