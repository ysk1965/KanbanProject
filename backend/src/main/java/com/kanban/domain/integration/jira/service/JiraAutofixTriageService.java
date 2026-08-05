package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.block.Block;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.global.config.ClaudeAIProvider;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

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

    /**
     * 이슈당 프롬프트에 넣을 댓글 수와 길이.
     *
     * <p>최신 쪽을 남긴다 — 재현 절차는 앞에 있지만 "기획 의도였다", "재현 안 됨", "중복"처럼
     * 판정을 뒤집는 말은 대개 뒤에 온다.
     */
    private static final int COMMENT_COUNT = 5;
    private static final int COMMENT_CLIP = 300;

    /**
     * 실적을 프롬프트에 넣기 위한 최소 표본.
     *
     * <p>1~2건으로 만든 "성공률"은 노이즈이고, 모델은 그 숫자를 근거처럼 받아들인다.
     * 근거가 없을 때는 아무 말도 하지 않는 편이 낫다.
     */
    private static final int OUTCOME_MIN_TOTAL = 5;
    private static final int OUTCOME_MIN_PER_CATEGORY = 2;

    private static final String FEATURE_TYPE = "JIRA_AUTOFIX_TRIAGE";

    private final ClaudeAIProvider claudeAIProvider;
    private final ObjectMapper objectMapper;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final TaskRepository taskRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraAutofixTriageRepository triageRepository;
    /** 실행 진행률 원장. 판정이 백그라운드로 도는 동안 화면이 보는 유일한 상태다. */
    private final JiraAutofixTriageRunRepository runRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;
    private final CommentRepository commentRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    /** 목록에 붙일 담당자·색을 위한 조회 전용 의존성. 판정 자체에는 쓰이지 않는다. */
    private final ChecklistItemRepository checklistItemRepository;
    private final BoardMemberRepository boardMemberRepository;

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
            - CANDIDATE: 본문과 댓글을 합쳐 기대 동작이 확정되고, 위 검증 수단 중 하나를 바로 쓸 수 있다
            - CONDITIONAL: 재현 절차나 기대 사양이 아직 없고, 그것이 채워지면 검증 가능해진다
            - EXCLUDED: 시각 확인이나 기획 의도 판단이 필요해 자동 검증이 원리적으로 불가능하다
            </verdict>

            <댓글>
            댓글은 본문과 같은 무게로 읽는다. 본문에 없던 재현 절차나 확정된 사양이 댓글에
            들어와 있으면 그 이슈는 이미 조건이 채워진 것이므로 CONDITIONAL이 아니라 CANDIDATE다
            — "추가되면"의 그 추가가 댓글로 이미 일어난 상태다.

            반대로 판정을 뒤집는 말도 대개 댓글에 있다. "재현 안 됨", "기획 의도였음", "다른
            이슈와 중복", "이미 수정됨" 같은 결론이 달려 있으면 본문이 아무리 명확해도 EXCLUDED다.
            가장 최근 댓글이 이슈의 현재 상태다.
            </댓글>

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

            %s
            """;

    // ── 실행 ──────────────────────────────────────

    /**
     * 트리아지를 시작한다. <b>여기서 기다리지 않는다</b> — 실행 상태만 즉시 돌려주고, 판정은
     * 백그라운드에서 돈다.
     *
     * <p>이슈 15건마다 AI 호출 한 번이라 100건이면 수 분이 걸린다. 요청 스레드에서 끝까지 돌면
     * ALB idle timeout(90s)에 걸려 504가 나는데, 그동안 서버는 멀쩡히 판정을 계속하므로
     * 화면만 실패로 보인다 — 사람이 다시 누르면 AI 호출이 두 배가 된다.
     *
     * <p>이미 도는 실행이 있으면 새로 시작하지 않고 그 상태를 돌려준다. 같은 이유다.
     *
     * @param force     true면 이슈가 안 바뀌었어도 전건 재판정
     * @param issueKeys 지정하면 그 이슈들만, 그리고 <b>반드시</b> 다시 판정한다. 화면에서 "판정 후
     *                  변경된 건만 다시" 누르는 경로다 — 카드가 BRIDGE 안에서만 움직였을 때는
     *                  JIRA 갱신 시각이 그대로라 평소 기준으로는 전부 건너뛰어 버튼이 아무 일도 안 한다.
     */
    public JiraAutofixResponse.TriageRun startTriage(String boardId, String userId,
                                                     boolean force, List<String> issueKeys) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        JiraAutofixTriageRun previous = runRepository.findLatest(boardId).orElse(null);
        if (previous != null && previous.isRunning()) {
            if (!previous.isStale()) return toRunResponse(previous, boardId);
            // 배포·인스턴스 교체로 스레드가 사라진 유령 실행. 치우지 않으면 이 보드는 다시 못 돈다
            previous.fail("실행이 응답 없이 끊겼습니다");
            runRepository.save(previous);
            log.warn("JIRA autofix triage: reclaimed stale run (board={}, run={})", boardId, previous.getId());
        }

        Scope scope = resolveScope(boardId, force, issueKeys);
        if (scope.links().isEmpty()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_NO_LINKED_ISSUES);
        }

        JiraAutofixTriageRun run = runRepository.save(JiraAutofixTriageRun.start(
                board, userId, scope.links().size(), scope.targets().size(),
                scope.links().size() - scope.targets().size(), scope.scoped()));

        // 판정할 게 없으면 백그라운드로 보낼 이유가 없다 — 화면이 폴링만 한 바퀴 헛돈다
        if (scope.targets().isEmpty()) {
            run.succeed();
            return toRunResponse(runRepository.save(run), boardId);
        }

        eventPublisher.publishEvent(
                new JiraAutofixTriageRequestedEvent(run.getId(), boardId, userId, force, issueKeys));

        return toRunResponse(run, boardId);
    }

    /** 마지막 실행 상태. 화면은 RUNNING인 동안 이걸 폴링해 진행률을 그린다. */
    public JiraAutofixResponse.TriageRun getRunStatus(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        JiraAutofixTriageRun run = runRepository.findLatest(boardId).orElse(null);
        if (run == null) {
            // 한 번도 안 돌린 보드. 화면은 status=null을 "실행 중 아님"으로 읽는다
            return JiraAutofixResponse.TriageRun.builder()
                    .summary(buildSummary(boardId))
                    .build();
        }

        if (run.isStale()) {
            run.fail("실행이 응답 없이 끊겼습니다");
            runRepository.save(run);
        }

        return toRunResponse(run, boardId);
    }

    /**
     * 백그라운드 실행 본체. {@link JiraAutofixTriageListener}만 부른다.
     *
     * <p>클래스 전체에 트랜잭션을 걸지 않는다 — 배치마다 수 초짜리 HTTP 호출이 있어 커넥션을
     * 잡고 있으면 안 된다. 저장은 배치 단위로 {@code saveAll}이 각자의 트랜잭션에서 처리한다.
     * 중간에 실패해도 거기까지의 판정은 남는다.
     */
    public void executeRun(String runId, String boardId, String userId,
                           boolean force, List<String> issueKeys) {
        JiraAutofixTriageRun run = runRepository.findById(runId).orElse(null);
        if (run == null) {
            log.warn("JIRA autofix triage: run not found ({})", runId);
            return;
        }

        try {
            Board board = boardRepository.findById(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

            // 시작 때와 같은 기준으로 다시 뽑는다 — 대상 목록은 스레드를 건너 넘기지 않는다
            Scope scope = resolveScope(boardId, force, issueKeys);

            runBatches(board, userId, scope, (triagedDelta, batchFailed) -> {
                run.progress(triagedDelta, batchFailed);
                runRepository.save(run);
            });

            run.succeed();
            runRepository.save(run);
        } catch (Exception e) {
            log.error("JIRA autofix triage run failed (board={}, run={}): {}",
                    boardId, runId, e.getMessage(), e);
            run.fail(e.getMessage() != null ? e.getMessage() : "트리아지 실행에 실패했습니다");
            runRepository.save(run);
        }
    }

    /**
     * 동기 실행. 진행률을 남기지 않고 끝까지 돈다 — 화면 경로는 {@link #startTriage}다.
     *
     * <p>배치 루프의 동작(건너뛰기·부분 실패·집계)을 검증하는 통로로 남겨 둔다.
     */
    public JiraAutofixResponse.TriageRun triageBoard(String boardId, String userId, boolean force) {
        return triageBoard(boardId, userId, force, null);
    }

    /** 범위를 좁힌 동기 실행. {@link #triageBoard(String, String, boolean)} 참고. */
    public JiraAutofixResponse.TriageRun triageBoard(String boardId, String userId,
                                                     boolean force, List<String> issueKeys) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Scope scope = resolveScope(boardId, force, issueKeys);
        if (scope.links().isEmpty()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_NO_LINKED_ISSUES);
        }

        int[] result = runBatches(board, userId, scope, (triagedDelta, batchFailed) -> { });

        return JiraAutofixResponse.TriageRun.builder()
                .status(AutofixTriageRunStatus.SUCCEEDED.name())
                .scanned(scope.links().size())
                .total(scope.targets().size())
                .triaged(result[0])
                .skipped(scope.links().size() - scope.targets().size())
                .failedBatches(result[1])
                .scoped(scope.scoped())
                .summary(buildSummary(boardId))
                .build();
    }

    /** 배치 하나가 끝날 때마다 불린다. 화면이 진척을 보는 유일한 통로. */
    @FunctionalInterface
    private interface BatchProgress {
        void accept(int triagedDelta, boolean batchFailed);
    }

    /** 판정 대상 산출 결과. 시작과 실행이 같은 기준을 봐야 진행률의 분모가 맞는다. */
    private record Scope(List<JiraIssueLink> links, List<JiraIssueLink> targets,
                         Map<String, JiraAutofixTriage> existing, boolean scoped) { }

    private Scope resolveScope(String boardId, boolean force, List<String> issueKeys) {
        boolean scoped = issueKeys != null && !issueKeys.isEmpty();
        Set<String> wanted = scoped ? new HashSet<>(issueKeys) : Set.of();

        List<JiraIssueLink> links = issueLinkRepository
                .findByBoardIdAndTargetType(boardId, JiraLinkTargetType.TASK).stream()
                .filter(link -> !link.isJiraDeleted())
                .filter(link -> !scoped || wanted.contains(link.getJiraIssueKey()))
                .toList();

        Map<String, JiraAutofixTriage> existing = new HashMap<>();
        for (JiraAutofixTriage triage : triageRepository.findByBoardId(boardId)) {
            existing.put(triage.getJiraIssueKey(), triage);
        }

        List<JiraIssueLink> targets = links.stream()
                .filter(link -> {
                    if (force || scoped) return true;
                    JiraAutofixTriage prior = existing.get(link.getJiraIssueKey());
                    return prior == null || prior.isStaleAgainst(link.getJiraUpdatedAt());
                })
                .toList();

        return new Scope(links, targets, existing, scoped);
    }

    /** 배치 루프. 반환값은 {@code [반영된 판정 수, 실패한 배치 수]}. */
    private int[] runBatches(Board board, String userId, Scope scope, BatchProgress progress) {
        String boardId = board.getId();
        List<JiraIssueLink> targets = scope.targets();

        // 저장소에 어떤 검증 수단이 실제로 있는지가 판정을 좌우한다 — 없는 테스트를 전제하면 후보가 부푼다
        TestInfraLevel testInfra = configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::resolveAutofixTestInfra)
                .orElse(TestInfraLevel.NONE);
        String systemPrompt = buildSystemPrompt(testInfra, boardId);

        log.info("JIRA autofix triage: board={} scanned={} targets={} skipped={} scoped={} testInfra={}",
                boardId, scope.links().size(), targets.size(),
                scope.links().size() - targets.size(), scope.scoped(), testInfra);

        Map<String, Task> tasks = loadTasks(targets);

        int triaged = 0;
        int failedBatches = 0;

        for (int from = 0; from < targets.size(); from += BATCH_SIZE) {
            List<JiraIssueLink> batch = targets.subList(from, Math.min(from + BATCH_SIZE, targets.size()));
            try {
                int done = triageBatch(board, userId, batch, tasks, scope.existing(), systemPrompt);
                triaged += done;
                progress.accept(done, false);
            } catch (BusinessException e) {
                // 크레딧이 바닥난 것은 배치의 사정이 아니다 — 남은 배치도 전부 같은 이유로 죽는다.
                // 계속 돌면 "묶음 8개 실패"만 남고 진짜 이유는 어디에도 안 뜬다
                if (e.getErrorCode() == ErrorCode.AI_CREDITS_EXHAUSTED) throw e;
                failedBatches++;
                progress.accept(0, true);
                log.warn("JIRA autofix triage batch failed (board={}, from={}): {}",
                        boardId, from, e.getMessage());
            } catch (Exception e) {
                // 한 배치가 죽어도 나머지는 계속 간다 — 100건 중 15건 때문에 전부 날리지 않는다
                failedBatches++;
                progress.accept(0, true);
                log.warn("JIRA autofix triage batch failed (board={}, from={}): {}",
                        boardId, from, e.getMessage());
            }
        }

        return new int[] { triaged, failedBatches };
    }

    private JiraAutofixResponse.TriageRun toRunResponse(JiraAutofixTriageRun run, String boardId) {
        return JiraAutofixResponse.TriageRun.builder()
                .status(run.getStatus().name())
                .scanned(run.getScanned())
                .total(run.getTotal())
                .triaged(run.getTriaged())
                .skipped(run.getSkipped())
                .failedBatches(run.getFailedBatches())
                .scoped(run.isScoped())
                .errorMessage(run.getErrorMessage())
                .startedAt(run.getStartedAt())
                .finishedAt(run.getFinishedAt())
                .summary(buildSummary(boardId))
                .build();
    }

    /** 저장소 검증 기반 수준과 이 보드의 실적을 프롬프트에 박아 넣는다. */
    private String buildSystemPrompt(TestInfraLevel level, String boardId) {
        return SYSTEM_PROMPT_TEMPLATE.formatted(
                TEST_INFRA_PROMPT.getOrDefault(level, TEST_INFRA_PROMPT.get(TestInfraLevel.NONE)),
                buildOutcomeBlock(boardId));
    }

    /**
     * 이 보드에서 유형별로 실제 어떻게 끝났는지.
     *
     * <p>confidence가 지금까지는 순수한 감이었다. 판정이 맞았는지는 판정으로 알 수 없고 그 뒤에
     * 벌어진 일로만 아는데, 그 결과가 다음 판정으로 돌아오지 않으니 같은 유형에서 같은 실수를
     * 반복해도 교정될 길이 없었다.
     *
     * <p>표본이 얇으면 아무 말도 하지 않는다 — 2건 중 1건 성공을 "50%"라고 적어 주면 모델은
     * 그것을 근거로 받아들인다. 없는 근거보다 나쁜 것이 가짜 근거다.
     */
    private String buildOutcomeBlock(String boardId) {
        List<Object[]> rows = triageRepository.countOutcomesByCategory(boardId);

        Map<AutofixCategory, int[]> tally = new EnumMap<>(AutofixCategory.class);
        int total = 0;
        for (Object[] row : rows) {
            AutofixCategory category = (AutofixCategory) row[0];
            AutofixJobStatus status = (AutofixJobStatus) row[1];
            int count = ((Number) row[2]).intValue();
            if (category == null || status == null) continue;

            int[] slot = tally.computeIfAbsent(category, k -> new int[3]);
            switch (status) {
                case SUCCEEDED -> slot[0] += count;
                case NO_CHANGE -> slot[1] += count;
                case FAILED -> slot[2] += count;
                default -> { }
            }
            total += count;
        }

        if (total < OUTCOME_MIN_TOTAL) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("<실적>\n");
        sb.append("이 보드에서 실제로 자동수정을 태워 본 결과다. 유형별로 정말 통했는지를 보고\n");
        sb.append("confidence를 조정하라. 아래에 없는 유형은 근거가 없다는 뜻이니 보수적으로 잡는다.\n");
        boolean any = false;
        for (Map.Entry<AutofixCategory, int[]> e : tally.entrySet()) {
            int[] v = e.getValue();
            int sum = v[0] + v[1] + v[2];
            if (sum < OUTCOME_MIN_PER_CATEGORY) continue;
            any = true;
            sb.append("- ").append(e.getKey().name())
              .append(": ").append(sum).append("건 중 PR ").append(v[0])
              .append(" / 변경없음 ").append(v[1])
              .append(" / 실패 ").append(v[2]).append('\n');
        }
        if (!any) return "";
        sb.append("변경없음은 에이전트가 고칠 수 없다고 판단한 것이다 — 그 유형을 후보로 본 판정이\n");
        sb.append("틀렸다는 신호이므로, 같은 유형이 또 오면 confidence를 낮춘다.\n");
        sb.append("</실적>");
        return sb.toString();
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

    /**
     * 판정별 목록. verdict가 null이면 전건.
     *
     * <p>판정 결과만으로는 목록이 읽히지 않는다 — 무슨 버그인지(제목), 지금 어디에 있는지(블록·QA),
     * 누가 물고 있는지(체크리스트 담당자)가 함께 와야 화면이 걸러낼 수 있다. 그래서 태스크·체크리스트·
     * 멤버색을 <b>세 번의 일괄 조회</b>로 붙인다(행마다 조회하면 수백 건에서 N+1이 터진다).
     */
    @Transactional(readOnly = true)
    public List<JiraAutofixResponse.TriageItem> getItems(String boardId, String userId, String verdict) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<JiraAutofixTriage> rows;
        if (verdict == null || verdict.isBlank()) {
            rows = triageRepository.findByBoardId(boardId);
        } else {
            rows = triageRepository.findByBoardIdAndVerdict(boardId, parseVerdict(verdict));
        }

        List<String> taskIds = rows.stream()
                .map(JiraAutofixTriage::getTaskId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        Map<String, Task> taskById = taskIds.isEmpty() ? Map.of()
                : taskRepository.findByIdInWithBlockAndFeature(taskIds).stream()
                        .collect(Collectors.toMap(Task::getId, t -> t, (a, b) -> a));

        Map<String, List<JiraAutofixResponse.Assignee>> assigneesByTask =
                loadChecklistAssignees(boardId, taskIds);

        return rows.stream()
                .sorted(Comparator.comparingDouble(
                        (JiraAutofixTriage t) -> t.getConfidence() == null ? 0.0 : t.getConfidence()).reversed())
                .map(t -> {
                    Task task = t.getTaskId() != null ? taskById.get(t.getTaskId()) : null;
                    return JiraAutofixResponse.TriageItem.builder()
                            .jiraIssueKey(t.getJiraIssueKey())
                            .taskId(t.getTaskId())
                            .verdict(t.getVerdict().name())
                            .category(t.getCategory().name())
                            .confidence(t.getConfidence())
                            .verification(t.getVerification())
                            .reason(t.getReason())
                            .triagedAt(t.getUpdatedAt() != null ? t.getUpdatedAt().toString() : null)
                            .taskTitle(task != null ? task.getTitle() : null)
                            .taskState(toTaskState(task))
                            .assignees(assigneesByTask.getOrDefault(
                                    t.getTaskId(), List.of()))
                            .staleTriage(isStale(t, task))
                            .build();
                })
                .toList();
    }

    /** 태스크가 판정 이후 수정됐는지. 둘 중 하나라도 시각이 없으면 낡았다고 단정하지 않는다. */
    private boolean isStale(JiraAutofixTriage triage, Task task) {
        if (task == null || task.getUpdatedAt() == null || triage.getUpdatedAt() == null) return false;
        return task.getUpdatedAt().isAfter(triage.getUpdatedAt());
    }

    private JiraAutofixResponse.TaskState toTaskState(Task task) {
        if (task == null) return null;
        Block block = task.getBlock();
        return JiraAutofixResponse.TaskState.builder()
                .blockId(block != null ? block.getId() : null)
                .blockName(block != null ? block.getName() : null)
                .blockPosition(block != null ? block.getPosition() : null)
                .blockFixedType(block != null && block.getFixedType() != null
                        ? block.getFixedType().name() : null)
                .qaState(task.getQaState() != null ? task.getQaState().name() : null)
                .completed(Boolean.TRUE.equals(task.getIsCompleted()))
                .alreadyDone(AutofixTaskStage.isAlreadyDone(task))
                .build();
    }

    /**
     * 태스크별 체크리스트 담당자. 사람은 보드 멤버 색을, 외주는 계약자 색을 쓴다 —
     * 색이 카드와 어긋나면 같은 사람이 두 색으로 보인다.
     *
     * <p>같은 사람이 여러 체크리스트를 맡고 있어도 한 번만 넣는다.
     */
    private Map<String, List<JiraAutofixResponse.Assignee>> loadChecklistAssignees(
            String boardId, List<String> taskIds) {
        if (taskIds.isEmpty()) return Map.of();

        Map<String, String> colorByUserId = boardMemberRepository.findByBoardId(boardId).stream()
                .filter(m -> m.getUser() != null && m.getAssigneeColor() != null)
                .collect(Collectors.toMap(m -> m.getUser().getId(),
                        BoardMember::getAssigneeColor, (a, b) -> a));

        Map<String, List<JiraAutofixResponse.Assignee>> byTask = new LinkedHashMap<>();
        Map<String, Set<String>> seenByTask = new HashMap<>();

        for (ChecklistItem item : checklistItemRepository.findByTaskIdInWithAssignee(taskIds)) {
            String taskId = item.getTask().getId();
            Set<String> seen = seenByTask.computeIfAbsent(taskId, k -> new HashSet<>());

            if (item.getAssignee() != null) {
                User user = item.getAssignee();
                if (seen.add("u:" + user.getId())) {
                    byTask.computeIfAbsent(taskId, k -> new ArrayList<>())
                            .add(JiraAutofixResponse.Assignee.builder()
                                    .id(user.getId())
                                    .name(user.getName())
                                    .color(colorByUserId.get(user.getId()))
                                    .external(false)
                                    .build());
                }
            }
            if (item.getContractor() != null) {
                BoardContractor c = item.getContractor();
                if (seen.add("c:" + c.getId())) {
                    byTask.computeIfAbsent(taskId, k -> new ArrayList<>())
                            .add(JiraAutofixResponse.Assignee.builder()
                                    .id(c.getId())
                                    .name(c.getName())
                                    .color(c.getColor())
                                    .external(true)
                                    .build());
                }
            }
        }
        return byTask;
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
              .append('\n');

            appendComments(sb, task.getId());
            appendMaterialNote(sb, task.getId());
            sb.append('\n');
        }
        return sb.toString();
    }

    /** 댓글 — 오래된 순으로 보이되, 넘치면 최신 쪽을 남긴다. */
    private void appendComments(StringBuilder sb, String taskId) {
        List<Comment> all = commentRepository.findByTaskIdWithAuthor(taskId).stream()
                .sorted(Comparator.comparing(Comment::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        if (all.isEmpty()) return;

        List<Comment> shown = all.size() > COMMENT_COUNT
                ? all.subList(all.size() - COMMENT_COUNT, all.size())
                : all;

        sb.append("댓글 ").append(all.size()).append("건");
        if (shown.size() < all.size()) sb.append(" (최근 ").append(shown.size()).append("건만)");
        sb.append(":\n");
        for (Comment c : shown) {
            sb.append("  - ")
              .append(c.getAuthor() != null ? c.getAuthor().getName() : "?")
              .append(": ")
              .append(c.getContent() == null ? "" : clip(c.getContent(), COMMENT_CLIP))
              .append('\n');
        }
    }

    /**
     * 스크린샷·영상은 <b>있다는 사실만</b> 알린다.
     *
     * <p>그림 자체를 넣으면 판정 정확도는 오르지만 이슈당 토큰이 몇 배가 된다. 반면 "재현
     * 화면이 첨부돼 있다"는 사실 한 줄은 거의 공짜이면서, 수정 에이전트가 눈으로 확인할 수단을
     * 쥐고 시작한다는 뜻이라 판정에 실제로 쓸모가 있다.
     */
    private void appendMaterialNote(StringBuilder sb, String taskId) {
        long images = commentAttachmentRepository.findByTaskId(taskId).stream()
                .filter(a -> a.getContentType() != null
                        && (a.getContentType().startsWith("image/")
                            || a.getContentType().startsWith("video/")))
                .count();
        if (images > 0) {
            sb.append("첨부: 재현 화면 ").append(images)
              .append("건 있음 (수정 담당 에이전트는 이 그림을 직접 본다)\n");
        }
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
