package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.config.ClaudeAIProvider;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 자동수정 트리아지 계약 고정 테스트.
 *
 * <p>런타임에만 드러나는 부분을 잡는다: 재판정 스킵 조건, 배치 단위 실패 격리,
 * 모델 응답 정규화(범위 밖 confidence·미지의 이슈키), 집계 계산.
 */
class JiraAutofixTriageServiceTest {

    private static final String MODEL = "claude-sonnet-5";
    private static final String BOARD_ID = "board-1";
    private static final String USER_ID = "user-1";

    private ClaudeAIProvider claudeAIProvider;
    private BoardRepository boardRepository;
    private BoardService boardService;
    private TaskRepository taskRepository;
    private JiraIssueLinkRepository issueLinkRepository;
    private JiraIntegrationConfigRepository configRepository;
    private JiraAutofixTriageRepository triageRepository;
    private AiUsageLogRepository aiUsageLogRepository;
    private AiCreditService aiCreditService;
    private CommentRepository commentRepository;
    private CommentAttachmentRepository commentAttachmentRepository;
    private ChecklistItemRepository checklistItemRepository;
    private BoardMemberRepository boardMemberRepository;
    private JiraAutofixTriageService service;

    private Board board;

    @BeforeEach
    void setUp() {
        claudeAIProvider = mock(ClaudeAIProvider.class);
        boardRepository = mock(BoardRepository.class);
        boardService = mock(BoardService.class);
        taskRepository = mock(TaskRepository.class);
        issueLinkRepository = mock(JiraIssueLinkRepository.class);
        configRepository = mock(JiraIntegrationConfigRepository.class);
        triageRepository = mock(JiraAutofixTriageRepository.class);
        aiUsageLogRepository = mock(AiUsageLogRepository.class);
        aiCreditService = mock(AiCreditService.class);
        commentRepository = mock(CommentRepository.class);
        commentAttachmentRepository = mock(CommentAttachmentRepository.class);
        checklistItemRepository = mock(ChecklistItemRepository.class);
        boardMemberRepository = mock(BoardMemberRepository.class);

        service = new JiraAutofixTriageService(
                claudeAIProvider, new ObjectMapper(), boardRepository, boardService,
                taskRepository, issueLinkRepository, configRepository, triageRepository,
                aiUsageLogRepository, aiCreditService,
                commentRepository, commentAttachmentRepository,
                checklistItemRepository, boardMemberRepository);
        ReflectionTestUtils.setField(service, "model", MODEL);

        board = mock(Board.class);
        lenient().when(board.getId()).thenReturn(BOARD_ID);
        when(boardRepository.findById(BOARD_ID)).thenReturn(Optional.of(board));

        // 기본값: 판정 이력 없음, 집계 비어 있음, 연동 설정 없음(→ 검증 기반 NONE)
        lenient().when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.empty());
        lenient().when(commentRepository.findByTaskIdWithAuthor(any())).thenReturn(List.of());
        lenient().when(commentAttachmentRepository.findByTaskId(any())).thenReturn(List.of());
        lenient().when(triageRepository.countOutcomesByCategory(any())).thenReturn(List.of());
        lenient().when(triageRepository.findByBoardId(BOARD_ID)).thenReturn(List.of());
        lenient().when(triageRepository.countByVerdictAndCategory(BOARD_ID)).thenReturn(List.of());
        lenient().when(triageRepository.saveAll(anyList()))
                .thenAnswer(inv -> new ArrayList<>(inv.getArgument(0, Collection.class)));
    }

    // ── 픽스처 ────────────────────────────────────

    private JiraIssueLink link(String key, LocalDateTime updated) {
        return JiraIssueLink.builder()
                .id("link-" + key)
                .board(board)
                .jiraIssueKey(key)
                .targetType(JiraLinkTargetType.TASK)
                .targetId("task-" + key)
                .jiraUpdatedAt(updated)
                .lastImportedAt(LocalDateTime.now())
                .build();
    }

    private Task task(String key, String title) {
        return Task.builder()
                .id("task-" + key)
                .title(title)
                .description("본문 " + key)
                .build();
    }

    /** 링크 N건 + 대응 태스크를 리포지토리에 물려둔다. */
    private List<JiraIssueLink> givenIssues(String... keys) {
        List<JiraIssueLink> links = new ArrayList<>();
        List<Task> tasks = new ArrayList<>();
        for (String key : keys) {
            links.add(link(key, LocalDateTime.of(2026, 8, 1, 0, 0)));
            tasks.add(task(key, "[전투] " + key + " 재현 문제"));
        }
        when(issueLinkRepository.findByBoardIdAndTargetType(BOARD_ID, JiraLinkTargetType.TASK))
                .thenReturn(links);
        when(taskRepository.findAllById(anyIterable())).thenReturn(tasks);
        return links;
    }

    private String resultJson(String key, String verdict, String category, String confidence) {
        return """
                {"results":[{"issue_key":"%s","verdict":"%s","category":"%s","confidence":%s,
                "verification":"EditMode 유닛 테스트 신규 작성","reason":"기대 동작이 본문에 확정돼 있다"}]}
                """.formatted(key, verdict, category, confidence);
    }

    private void stubClaude(String json, String stopReason) {
        when(claudeAIProvider.chatStructured(any(), any(), eq(MODEL), anyInt(), any()))
                .thenReturn(new ClaudeAIProvider.StructuredResponse(json, stopReason, 1000, 500, MODEL));
    }

    // ── 테스트 ────────────────────────────────────

    @Test
    @DisplayName("연동 이슈가 없으면 400 JI010 — AI를 호출하지 않는다")
    void noLinkedIssues() {
        when(issueLinkRepository.findByBoardIdAndTargetType(BOARD_ID, JiraLinkTargetType.TASK))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.triageBoard(BOARD_ID, USER_ID, false))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_NO_LINKED_ISSUES);

        verify(claudeAIProvider, never()).chatStructured(any(), any(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("JIRA에서 삭제된 이슈는 대상에서 빠진다")
    void deletedIssuesExcluded() {
        JiraIssueLink alive = link("QASA-1", LocalDateTime.of(2026, 8, 1, 0, 0));
        JiraIssueLink deleted = link("QASA-2", LocalDateTime.of(2026, 8, 1, 0, 0));
        deleted.markJiraDeleted();

        when(issueLinkRepository.findByBoardIdAndTargetType(BOARD_ID, JiraLinkTargetType.TASK))
                .thenReturn(List.of(alive, deleted));
        when(taskRepository.findAllById(anyIterable()))
                .thenReturn(List.of(task("QASA-1", "제목")));
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getScanned()).isEqualTo(1);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(any(), user.capture(), any(), anyInt(), any());
        assertThat(user.getValue()).contains("QASA-1").doesNotContain("QASA-2");
    }

    @Test
    @DisplayName("정상 판정 — 저장되고 실행 결과에 반영된다")
    void triagesAndSaves() {
        givenIssues("QASA-92");
        stubClaude(resultJson("QASA-92", "CANDIDATE", "TEXT", "0.9"), "end_turn");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getScanned()).isEqualTo(1);
        assertThat(run.getTriaged()).isEqualTo(1);
        assertThat(run.getSkipped()).isZero();
        assertThat(run.getFailedBatches()).isZero();

        ArgumentCaptor<List<JiraAutofixTriage>> saved = ArgumentCaptor.forClass(List.class);
        verify(triageRepository).saveAll(saved.capture());
        JiraAutofixTriage row = saved.getValue().get(0);

        assertThat(row.getJiraIssueKey()).isEqualTo("QASA-92");
        assertThat(row.getTaskId()).isEqualTo("task-QASA-92");
        assertThat(row.getVerdict()).isEqualTo(AutofixVerdict.CANDIDATE);
        assertThat(row.getCategory()).isEqualTo(AutofixCategory.TEXT);
        assertThat(row.getConfidence()).isEqualTo(0.9);
        assertThat(row.getModel()).isEqualTo(MODEL);
        // 재판정 판단 기준이 되므로 링크의 updated를 그대로 물고 있어야 한다
        assertThat(row.getJiraUpdatedAt()).isEqualTo(LocalDateTime.of(2026, 8, 1, 0, 0));
    }

    @Test
    @DisplayName("이슈가 안 바뀌었으면 건너뛴다 — 재실행해도 AI를 부르지 않는다")
    void skipsUnchangedIssues() {
        LocalDateTime updated = LocalDateTime.of(2026, 8, 1, 0, 0);
        givenIssues("QASA-92");

        JiraAutofixTriage prior = JiraAutofixTriage.builder()
                .board(board).jiraIssueKey("QASA-92").taskId("task-QASA-92")
                .verdict(AutofixVerdict.EXCLUDED).category(AutofixCategory.ASSET)
                .confidence(0.7).jiraUpdatedAt(updated).model(MODEL)
                .build();
        when(triageRepository.findByBoardId(BOARD_ID)).thenReturn(List.of(prior));

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getSkipped()).isEqualTo(1);
        assertThat(run.getTriaged()).isZero();
        verify(claudeAIProvider, never()).chatStructured(any(), any(), any(), anyInt(), any());
        verify(aiCreditService, never()).consumeCredit(any(), any(), any(), anyInt());
    }

    @Test
    @DisplayName("이슈 본문이 바뀌면 재판정하고 기존 행을 갱신한다")
    void retriagesChangedIssue() {
        givenIssues("QASA-92");   // link.jiraUpdatedAt = 2026-08-01

        JiraAutofixTriage prior = JiraAutofixTriage.builder()
                .board(board).jiraIssueKey("QASA-92").taskId("task-QASA-92")
                .verdict(AutofixVerdict.EXCLUDED).category(AutofixCategory.ASSET)
                .confidence(0.7)
                .jiraUpdatedAt(LocalDateTime.of(2026, 7, 1, 0, 0))   // 더 오래됨 → stale
                .model(MODEL)
                .build();
        when(triageRepository.findByBoardId(BOARD_ID)).thenReturn(List.of(prior));
        stubClaude(resultJson("QASA-92", "CANDIDATE", "LOGIC", "0.85"), "end_turn");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getTriaged()).isEqualTo(1);
        // 새 행이 아니라 기존 행이 갱신되어야 한다 (UNIQUE 충돌 방지)
        assertThat(prior.getVerdict()).isEqualTo(AutofixVerdict.CANDIDATE);
        assertThat(prior.getCategory()).isEqualTo(AutofixCategory.LOGIC);
        assertThat(prior.getJiraUpdatedAt()).isEqualTo(LocalDateTime.of(2026, 8, 1, 0, 0));
    }

    @Test
    @DisplayName("force=true면 안 바뀐 이슈도 전건 재판정한다")
    void forceRetriagesEverything() {
        LocalDateTime updated = LocalDateTime.of(2026, 8, 1, 0, 0);
        givenIssues("QASA-92");

        JiraAutofixTriage prior = JiraAutofixTriage.builder()
                .board(board).jiraIssueKey("QASA-92").taskId("task-QASA-92")
                .verdict(AutofixVerdict.EXCLUDED).category(AutofixCategory.ASSET)
                .confidence(0.7).jiraUpdatedAt(updated).model(MODEL)
                .build();
        when(triageRepository.findByBoardId(BOARD_ID)).thenReturn(List.of(prior));
        stubClaude(resultJson("QASA-92", "CANDIDATE", "TEXT", "0.9"), "end_turn");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, true);

        assertThat(run.getSkipped()).isZero();
        assertThat(run.getTriaged()).isEqualTo(1);
        verify(claudeAIProvider).chatStructured(any(), any(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("이슈를 지정하면 그것만 판정한다 — 나머지는 스캔 대상에서 아예 빠진다")
    void scopedTriageOnlyTouchesGivenIssues() {
        givenIssues("QASA-1", "QASA-2", "QASA-3");
        stubClaude(resultJson("QASA-2", "CANDIDATE", "TEXT", "0.9"), "end_turn");

        JiraAutofixResponse.TriageRun run =
                service.triageBoard(BOARD_ID, USER_ID, false, List.of("QASA-2"));

        assertThat(run.getScanned()).isEqualTo(1);
        assertThat(run.getTriaged()).isEqualTo(1);
        assertThat(run.getSkipped()).isZero();
    }

    @Test
    @DisplayName("지정한 이슈는 안 바뀌었어도 다시 판정한다 — 안 그러면 버튼이 아무 일도 안 한다")
    void scopedTriageIgnoresStalenessCheck() {
        LocalDateTime updated = LocalDateTime.of(2026, 8, 1, 0, 0);
        givenIssues("QASA-92");

        // JIRA 갱신 시각이 그대로인 상태(= 평소 기준이면 건너뛴다). 카드가 BRIDGE 안에서만 움직인 경우다
        JiraAutofixTriage prior = JiraAutofixTriage.builder()
                .board(board).jiraIssueKey("QASA-92").taskId("task-QASA-92")
                .verdict(AutofixVerdict.CANDIDATE).category(AutofixCategory.TEXT)
                .confidence(0.9).jiraUpdatedAt(updated).model(MODEL)
                .build();
        when(triageRepository.findByBoardId(BOARD_ID)).thenReturn(List.of(prior));
        stubClaude(resultJson("QASA-92", "EXCLUDED", "DESIGN_INTENT", "0.4"), "end_turn");

        JiraAutofixResponse.TriageRun run =
                service.triageBoard(BOARD_ID, USER_ID, false, List.of("QASA-92"));

        assertThat(run.getSkipped()).isZero();
        assertThat(run.getTriaged()).isEqualTo(1);
        verify(claudeAIProvider).chatStructured(any(), any(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("연동에 없는 이슈만 지정하면 판정할 게 없다고 알린다")
    void scopedTriageWithUnknownKeysFails() {
        givenIssues("QASA-1");

        assertThatThrownBy(() ->
                service.triageBoard(BOARD_ID, USER_ID, false, List.of("QASA-999")))
                .isInstanceOf(BusinessException.class);
        verify(claudeAIProvider, never()).chatStructured(any(), any(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("빈 목록은 범위 지정이 아니다 — 보드 전체 판정으로 간다")
    void emptyScopeFallsBackToWholeBoard() {
        givenIssues("QASA-1", "QASA-2");
        stubClaude("{\"results\":[]}", "end_turn");

        JiraAutofixResponse.TriageRun run =
                service.triageBoard(BOARD_ID, USER_ID, false, List.of());

        assertThat(run.getScanned()).isEqualTo(2);
    }

    @Test
    @DisplayName("배치가 15건 단위로 쪼개진다 — 20건이면 2회 호출")
    void splitsIntoBatches() {
        String[] keys = new String[20];
        for (int i = 0; i < 20; i++) keys[i] = "QASA-" + i;
        givenIssues(keys);
        stubClaude("{\"results\":[]}", "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        verify(claudeAIProvider, times(2)).chatStructured(any(), any(), any(), anyInt(), any());
        verify(aiCreditService, times(2)).consumeCredit(eq(BOARD_ID), eq(USER_ID),
                eq("JIRA_AUTOFIX_TRIAGE"), eq(1));
    }

    @Test
    @DisplayName("한 배치가 실패해도 나머지 배치는 계속 간다")
    void batchFailureIsIsolated() {
        String[] keys = new String[20];
        for (int i = 0; i < 20; i++) keys[i] = "QASA-" + i;
        givenIssues(keys);

        when(claudeAIProvider.chatStructured(any(), any(), eq(MODEL), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .thenReturn(new ClaudeAIProvider.StructuredResponse(
                        resultJson("QASA-15", "CANDIDATE", "TEXT", "0.8"), "end_turn", 100, 50, MODEL));

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getFailedBatches()).isEqualTo(1);
        assertThat(run.getTriaged()).isEqualTo(1);   // 2번째 배치의 결과는 살아남는다
    }

    @Test
    @DisplayName("stop_reason=max_tokens면 그 배치만 실패 처리한다")
    void truncatedBatchFails() {
        givenIssues("QASA-92");
        stubClaude("{\"results\":[", "max_tokens");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getFailedBatches()).isEqualTo(1);
        assertThat(run.getTriaged()).isZero();
        verify(triageRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("모델이 범위 밖 confidence를 주면 0~1로 잘라낸다")
    void clampsConfidence() {
        givenIssues("QASA-92");
        stubClaude(resultJson("QASA-92", "CANDIDATE", "TEXT", "1.7"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        ArgumentCaptor<List<JiraAutofixTriage>> saved = ArgumentCaptor.forClass(List.class);
        verify(triageRepository).saveAll(saved.capture());
        assertThat(saved.getValue().get(0).getConfidence()).isEqualTo(1.0);
    }

    @Test
    @DisplayName("모델이 없는 이슈키를 반환하면 무시한다 — 남의 이슈에 판정이 붙지 않는다")
    void ignoresUnknownIssueKey() {
        givenIssues("QASA-92");
        stubClaude(resultJson("QASA-999", "CANDIDATE", "TEXT", "0.9"), "end_turn");

        JiraAutofixResponse.TriageRun run = service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(run.getTriaged()).isZero();
        ArgumentCaptor<List<JiraAutofixTriage>> saved = ArgumentCaptor.forClass(List.class);
        verify(triageRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).isEmpty();
    }

    @Test
    @DisplayName("집계 — 후보 비율과 유형별 분포를 계산한다")
    void summaryAggregates() {
        when(triageRepository.countByVerdictAndCategory(BOARD_ID)).thenReturn(List.of(
                new Object[]{AutofixVerdict.CANDIDATE, AutofixCategory.TEXT, 3L},
                new Object[]{AutofixVerdict.CONDITIONAL, AutofixCategory.UI_STATE, 5L},
                new Object[]{AutofixVerdict.EXCLUDED, AutofixCategory.ASSET, 12L}
        ));

        JiraAutofixResponse.Summary summary = service.getSummary(BOARD_ID, USER_ID);

        assertThat(summary.getTotal()).isEqualTo(20);
        assertThat(summary.getCandidate()).isEqualTo(3);
        assertThat(summary.getConditional()).isEqualTo(5);
        assertThat(summary.getExcluded()).isEqualTo(12);
        assertThat(summary.getCandidateRatio()).isEqualTo(15.0);
        // 건수 많은 유형이 먼저 온다
        assertThat(summary.getCategories().get(0).getCategory()).isEqualTo("ASSET");
        assertThat(summary.getCategories().get(0).getExcluded()).isEqualTo(12);
    }

    @Test
    @DisplayName("판정이 하나도 없으면 후보 비율은 0 — 0으로 나누지 않는다")
    void summaryHandlesEmpty() {
        JiraAutofixResponse.Summary summary = service.getSummary(BOARD_ID, USER_ID);

        assertThat(summary.getTotal()).isZero();
        assertThat(summary.getCandidateRatio()).isZero();
        assertThat(summary.getCategories()).isEmpty();
    }

    @Test
    @DisplayName("잘못된 verdict 필터는 400 JI012")
    void invalidVerdictFilter() {
        assertThatThrownBy(() -> service.getItems(BOARD_ID, USER_ID, "MAYBE"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_INVALID_VERDICT);
    }

    @Test
    @DisplayName("실행 권한은 관리자 이상 — AI 비용이 나가는 경로다")
    void triageRequiresAdmin() {
        givenIssues("QASA-92");
        stubClaude(resultJson("QASA-92", "CANDIDATE", "TEXT", "0.9"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        verify(boardService).checkAdminOrAbove(BOARD_ID, USER_ID);
        verify(boardService, never()).checkMemberOrAbove(BOARD_ID, USER_ID);
    }

    @Test
    @DisplayName("프롬프트 — 판정 기준이 '자동 검증 가능성'으로 고정돼 있다")
    void promptFixesCriterion() {
        givenIssues("QASA-92");
        stubClaude("{\"results\":[]}", "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(
                system.capture(), user.capture(), eq(MODEL), eq(8192), any());

        assertThat(system.getValue())
                .contains("고쳐졌다는 것을 사람 눈 없이 자동으로 검증할 수 있는가")
                .contains("검증 수단이 없으면 EXCLUDED다")
                .contains("애매하면 낮은 쪽으로 판정한다");
        assertThat(user.getValue())
                .contains("=== QASA-92 ===")
                .contains("제목: [전투] QASA-92 재현 문제")
                .contains("본문: 본문 QASA-92");
    }

    // ── 저장소 검증 기반 수준 ─────────────────────

    private void givenTestInfra(TestInfraLevel level) {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder()
                .board(board)
                .autofixTestInfra(level)
                .build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));
    }

    @Test
    @DisplayName("연동 설정이 없으면 검증 기반을 NONE으로 본다 — 없는 테스트를 전제하지 않는다")
    void defaultsToNoTestInfra() {
        givenIssues("QASA-92");
        stubClaude("{\"results\":[]}", "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(system.capture(), any(), any(), anyInt(), any());
        assertThat(system.getValue())
                .contains("이 저장소에는 자동 테스트 코드가 전혀 없다")
                .contains("검증 수단으로 인정하지 않는다");
    }

    @Test
    @DisplayName("검증 기반 MATURE면 테스트 작성을 정상 수단으로 인정하는 프롬프트가 나간다")
    void matureTestInfraChangesPrompt() {
        givenIssues("QASA-92");
        givenTestInfra(TestInfraLevel.MATURE);
        stubClaude("{\"results\":[]}", "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(system.capture(), any(), any(), anyInt(), any());
        assertThat(system.getValue())
                .contains("테스트 기반이 갖춰져 있고")
                .doesNotContain("자동 테스트 코드가 전혀 없다");
    }

    @Test
    @DisplayName("검증 기반이 바뀌면 기존 판정을 비운다 — 다른 기준으로 낸 판정은 무의미하다")
    void changingTestInfraClearsVerdicts() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder()
                .board(board).autofixTestInfra(TestInfraLevel.NONE).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        String result = service.updateTestInfra(BOARD_ID, USER_ID, "MATURE");

        assertThat(result).isEqualTo("MATURE");
        assertThat(config.resolveAutofixTestInfra()).isEqualTo(TestInfraLevel.MATURE);
        verify(triageRepository).deleteByBoardId(BOARD_ID);
        verify(boardService).checkAdminOrAbove(BOARD_ID, USER_ID);
    }

    @Test
    @DisplayName("같은 값으로 저장하면 판정을 비우지 않는다")
    void sameTestInfraKeepsVerdicts() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder()
                .board(board).autofixTestInfra(TestInfraLevel.PARTIAL).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.updateTestInfra(BOARD_ID, USER_ID, "PARTIAL");

        verify(triageRepository, never()).deleteByBoardId(any());
    }

    @Test
    @DisplayName("알 수 없는 값은 NONE으로 떨어진다 — 낙관적 기본값을 만들지 않는다")
    void unknownTestInfraFallsBackToNone() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder()
                .board(board).autofixTestInfra(TestInfraLevel.MATURE).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        assertThat(service.updateTestInfra(BOARD_ID, USER_ID, "SOMEWHAT")).isEqualTo("NONE");
    }

    @Test
    @DisplayName("JIRA 연동이 없으면 검증 기반을 설정할 수 없다")
    void updateTestInfraRequiresConfig() {
        assertThatThrownBy(() -> service.updateTestInfra(BOARD_ID, USER_ID, "MATURE"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_NOT_CONFIGURED);
    }

    @Test
    @DisplayName("출력 스키마 고정 — 필수 필드와 enum 값")
    @SuppressWarnings("unchecked")
    void outputSchemaMatchesSpec() {
        givenIssues("QASA-92");
        stubClaude("{\"results\":[]}", "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        ArgumentCaptor<Map<String, Object>> schema = ArgumentCaptor.forClass(Map.class);
        verify(claudeAIProvider).chatStructured(any(), any(), any(), anyInt(), schema.capture());
        Map<String, Object> root = schema.getValue();

        assertThat(root.get("additionalProperties")).isEqualTo(false);
        assertThat((List<String>) root.get("required")).containsExactly("results");

        Map<String, Object> properties = (Map<String, Object>) root.get("properties");
        Map<String, Object> item =
                (Map<String, Object>) ((Map<String, Object>) properties.get("results")).get("items");
        assertThat(item.get("additionalProperties")).isEqualTo(false);
        assertThat((List<String>) item.get("required")).containsExactlyInAnyOrder(
                "issue_key", "verdict", "category", "confidence", "verification", "reason");

        Map<String, Object> itemProps = (Map<String, Object>) item.get("properties");
        Map<String, Object> verdict = (Map<String, Object>) itemProps.get("verdict");
        assertThat((List<String>) verdict.get("enum"))
                .containsExactly("CANDIDATE", "CONDITIONAL", "EXCLUDED");
    }

    // ── 개편: 댓글·첨부·실적 되먹임 ────────────────

    private Comment comment(String author, String body, int minute) {
        com.kanban.domain.user.User u = mock(com.kanban.domain.user.User.class);
        lenient().when(u.getName()).thenReturn(author);
        Comment c = mock(Comment.class);
        lenient().when(c.getAuthor()).thenReturn(u);
        lenient().when(c.getContent()).thenReturn(body);
        lenient().when(c.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 8, 5, 10, minute));
        return c;
    }

    private String capturedUserPrompt() {
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(any(), user.capture(), any(), anyInt(), any());
        return user.getValue();
    }

    private String capturedSystemPrompt() {
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(system.capture(), any(), any(), anyInt(), any());
        return system.getValue();
    }

    @Test
    @DisplayName("댓글이 판정 근거에 들어간다 — 재현 절차가 본문이 아니라 댓글에 오는 이슈가 많다")
    void includesCommentsInPrompt() {
        givenIssues("QASA-1");
        List<Comment> comments = List.of(comment("QA", "3층 진입 시에만 재현됩니다", 10));
        when(commentRepository.findByTaskIdWithAuthor("task-QASA-1")).thenReturn(comments);
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(capturedUserPrompt())
                .contains("댓글 1건")
                .contains("QA: 3층 진입 시에만 재현됩니다");
    }

    @Test
    @DisplayName("댓글이 많으면 최신 쪽을 남긴다 — 판정을 뒤집는 결론은 대개 뒤에 온다")
    void keepsLatestCommentsWhenOverflowing() {
        givenIssues("QASA-1");
        List<Comment> many = List.of(
                comment("A", "첫째", 1), comment("B", "둘째", 2), comment("C", "셋째", 3),
                comment("D", "넷째", 4), comment("E", "다섯째", 5), comment("F", "여섯째", 6));
        when(commentRepository.findByTaskIdWithAuthor("task-QASA-1")).thenReturn(many);
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        String prompt = capturedUserPrompt();
        assertThat(prompt).contains("댓글 6건 (최근 5건만)").contains("여섯째").doesNotContain("첫째");
    }

    @Test
    @DisplayName("재현 화면은 있다는 사실만 알린다 — 그림 자체를 넣으면 이슈당 토큰이 몇 배가 된다")
    void mentionsMaterialsWithoutEmbeddingThem() {
        givenIssues("QASA-1");
        CommentAttachment shot = mock(CommentAttachment.class);
        lenient().when(shot.getContentType()).thenReturn("image/png");
        when(commentAttachmentRepository.findByTaskId("task-QASA-1")).thenReturn(List.of(shot));
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(capturedUserPrompt()).contains("재현 화면 1건 있음");
    }

    @Test
    @DisplayName("표본이 얇으면 실적을 말하지 않는다 — 가짜 근거는 없는 근거보다 나쁘다")
    void omitsOutcomeBlockWhenSampleTooSmall() {
        givenIssues("QASA-1");
        when(triageRepository.countOutcomesByCategory(BOARD_ID)).thenReturn(List.<Object[]>of(
                new Object[]{AutofixCategory.TEXT, AutofixJobStatus.SUCCEEDED, 2L}));
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(capturedSystemPrompt()).doesNotContain("<실적>");
    }

    @Test
    @DisplayName("표본이 쌓이면 유형별 실적을 근거로 준다 — confidence가 감이 아니라 경험이 된다")
    void feedsOutcomesBackIntoPrompt() {
        givenIssues("QASA-1");
        when(triageRepository.countOutcomesByCategory(BOARD_ID)).thenReturn(List.<Object[]>of(
                new Object[]{AutofixCategory.TEXT, AutofixJobStatus.SUCCEEDED, 4L},
                new Object[]{AutofixCategory.TEXT, AutofixJobStatus.NO_CHANGE, 1L},
                new Object[]{AutofixCategory.ASSET, AutofixJobStatus.FAILED, 3L}));
        stubClaude(resultJson("QASA-1", "CANDIDATE", "TEXT", "0.8"), "end_turn");

        service.triageBoard(BOARD_ID, USER_ID, false);

        assertThat(capturedSystemPrompt())
                .contains("<실적>")
                .contains("TEXT: 5건 중 PR 4 / 변경없음 1 / 실패 0")
                .contains("ASSET: 3건 중 PR 0 / 변경없음 0 / 실패 3");
    }
}
