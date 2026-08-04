package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.GithubInstallation;
import com.kanban.domain.integration.github.service.GithubApiClient;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
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
 * 자동수정 큐 계약 고정.
 *
 * <p>여기서 잡는 것은 가드레일이다 — 직렬 보장, 이슈당 1회, confidence 임계값, 일일 상한,
 * 타임아웃 회수. 하나라도 새면 검증 안 된 PR이 쏟아지거나 큐가 영구히 막힌다.
 */
class JiraAutofixQueueServiceTest {

    private static final String BOARD_ID = "board-1";
    private static final String USER_ID = "user-1";
    private static final String REPO = "cookapps-devops/GWBM013-auto-battle-project";

    private AutofixProperties properties;
    private BoardRepository boardRepository;
    private BoardService boardService;
    private JiraAutofixTriageRepository triageRepository;
    private JiraAutofixJobRepository jobRepository;
    private JiraIntegrationConfigRepository configRepository;
    private TaskRepository taskRepository;
    private BoardGithubRepoRepository boardGithubRepoRepository;
    private GithubApiClient githubApiClient;
    private JiraApiClient jiraApiClient;
    private JiraOAuthService oauthService;
    private JiraAutofixQueueService service;

    private Board board;

    @BeforeEach
    void setUp() {
        properties = new AutofixProperties();
        boardRepository = mock(BoardRepository.class);
        boardService = mock(BoardService.class);
        triageRepository = mock(JiraAutofixTriageRepository.class);
        jobRepository = mock(JiraAutofixJobRepository.class);
        configRepository = mock(JiraIntegrationConfigRepository.class);
        taskRepository = mock(TaskRepository.class);
        boardGithubRepoRepository = mock(BoardGithubRepoRepository.class);
        githubApiClient = mock(GithubApiClient.class);
        jiraApiClient = mock(JiraApiClient.class);
        oauthService = mock(JiraOAuthService.class);

        service = new JiraAutofixQueueService(
                properties, new ObjectMapper(), boardRepository, boardService,
                triageRepository, jobRepository, configRepository, taskRepository,
                boardGithubRepoRepository, githubApiClient, jiraApiClient, oauthService);
        ReflectionTestUtils.setField(service, "backendUrl", "https://api.example.com");

        board = mock(Board.class);
        lenient().when(board.getId()).thenReturn(BOARD_ID);
        lenient().when(boardRepository.findById(BOARD_ID)).thenReturn(Optional.of(board));
        lenient().when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.empty());
        lenient().when(configRepository.findActiveByBoardId(BOARD_ID)).thenReturn(Optional.empty());
        lenient().when(jobRepository.saveAll(anyList()))
                .thenAnswer(inv -> new ArrayList<>(inv.getArgument(0, Collection.class)));
        lenient().when(triageRepository.findByBoardIdAndJiraIssueKey(any(), any()))
                .thenReturn(Optional.empty());
    }

    // ── 픽스처 ────────────────────────────────────

    private void givenRepo(String branch) {
        GithubInstallation installation = mock(GithubInstallation.class);
        lenient().when(installation.getInstallationId()).thenReturn("inst-1");
        BoardGithubRepo repo = mock(BoardGithubRepo.class);
        lenient().when(repo.getInstallation()).thenReturn(installation);
        lenient().when(repo.getRepoFullName()).thenReturn(REPO);
        lenient().when(repo.getBranch()).thenReturn(branch);
        when(boardGithubRepoRepository.findByBoardIdAndActiveTrue(BOARD_ID)).thenReturn(List.of(repo));
    }

    private JiraAutofixTriage candidate(String key, double confidence) {
        return JiraAutofixTriage.builder()
                .board(board).jiraIssueKey(key).taskId("task-" + key)
                .verdict(AutofixVerdict.CANDIDATE).category(AutofixCategory.TEXT)
                .confidence(confidence).verification("문자열 정적 대조")
                .build();
    }

    private void givenCandidates(JiraAutofixTriage... items) {
        when(triageRepository.findByBoardIdAndVerdict(BOARD_ID, AutofixVerdict.CANDIDATE))
                .thenReturn(List.of(items));
    }

    private JiraAutofixJob queuedJob(String key) {
        JiraAutofixJob job = JiraAutofixJob.builder()
                .board(board).jiraIssueKey(key).taskId("task-" + key)
                .confidence(0.9).status(AutofixJobStatus.QUEUED)
                .queuedAt(LocalDateTime.now())
                .build();
        job.assignTarget("inst-1", REPO, "autofix.yaml", "develop");
        return job;
    }

    private void givenNextQueued(JiraAutofixJob job) {
        when(jobRepository.findByBoardIdAndStatus(eq(BOARD_ID), eq(AutofixJobStatus.QUEUED), any(Pageable.class)))
                .thenReturn(List.of(job));
    }

    // ── 큐 투입 가드레일 ───────────────────────────

    @Test
    @DisplayName("confidence 임계값 미달은 큐에 담지 않는다")
    void skipsLowConfidence() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9), candidate("QASA-2", 0.5));

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isEqualTo(1);
        assertThat(result.getSkippedLowConfidence()).isEqualTo(1);
    }

    @Test
    @DisplayName("이미 작업이 있는 이슈는 건너뛴다 — 같은 이슈로 PR이 둘 열리지 않게")
    void skipsAlreadyQueuedIssue() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9));
        when(jobRepository.existsActiveForIssue(BOARD_ID, "QASA-1")).thenReturn(true);

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isZero();
        assertThat(result.getSkippedAlreadyQueued()).isEqualTo(1);
    }

    @Test
    @DisplayName("디스패치 대상은 큐에 담는 시점에 스냅샷된다")
    void snapshotsDispatchTarget() {
        givenRepo("release/1.2");
        givenCandidates(candidate("QASA-1", 0.9));

        service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        ArgumentCaptor<List<JiraAutofixJob>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobRepository).saveAll(saved.capture());
        JiraAutofixJob job = saved.getValue().get(0);
        assertThat(job.getRepoFullName()).isEqualTo(REPO);
        assertThat(job.getInstallationId()).isEqualTo("inst-1");
        assertThat(job.getBaseRef()).isEqualTo("release/1.2");
        assertThat(job.getWorkflowFile()).isEqualTo("autofix.yaml");
    }

    @Test
    @DisplayName("저장소 브랜치가 없으면 설정된 기본 브랜치를 쓴다")
    void fallsBackToDefaultBaseRef() {
        givenRepo(null);
        givenCandidates(candidate("QASA-1", 0.9));

        service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        ArgumentCaptor<List<JiraAutofixJob>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobRepository).saveAll(saved.capture());
        assertThat(saved.getValue().get(0).getBaseRef()).isEqualTo("develop");
    }

    @Test
    @DisplayName("이슈키를 지정하면 그중에서만 담는다")
    void enqueuesOnlySelected() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9), candidate("QASA-2", 0.9), candidate("QASA-3", 0.9));

        JiraAutofixResponse.EnqueueResult result =
                service.enqueueCandidates(BOARD_ID, USER_ID, null, List.of("QASA-2"));

        assertThat(result.getQueued()).isEqualTo(1);
        ArgumentCaptor<List<JiraAutofixJob>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).singleElement()
                .extracting(JiraAutofixJob::getJiraIssueKey).isEqualTo("QASA-2");
    }

    @Test
    @DisplayName("골라 담아도 confidence 임계값은 그대로 적용된다 — 화면이 가드레일 우회 통로가 되면 안 된다")
    void selectionDoesNotBypassThreshold() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.4));

        JiraAutofixResponse.EnqueueResult result =
                service.enqueueCandidates(BOARD_ID, USER_ID, null, List.of("QASA-1"));

        assertThat(result.getQueued()).isZero();
        assertThat(result.getSkippedLowConfidence()).isEqualTo(1);
    }

    @Test
    @DisplayName("연결된 저장소가 없으면 거부한다")
    void rejectsWhenNoRepo() {
        when(boardGithubRepoRepository.findByBoardIdAndActiveTrue(BOARD_ID)).thenReturn(List.of());

        assertThatThrownBy(() -> service.enqueueCandidates(BOARD_ID, USER_ID, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_NO_REPO);
    }

    @Test
    @DisplayName("저장소가 여러 개면 추측하지 않고 거부한다 — 엉뚱한 곳에 PR을 열지 않는다")
    void rejectsAmbiguousRepo() {
        when(boardGithubRepoRepository.findByBoardIdAndActiveTrue(BOARD_ID))
                .thenReturn(List.of(mock(BoardGithubRepo.class), mock(BoardGithubRepo.class)));

        assertThatThrownBy(() -> service.enqueueCandidates(BOARD_ID, USER_ID, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_AMBIGUOUS_REPO);
    }

    // ── 디스패치 가드레일 ──────────────────────────

    @Test
    @DisplayName("진행 중인 작업이 있으면 다음 건을 보내지 않는다 — 직렬 보장")
    void doesNotDispatchWhileInFlight() {
        when(jobRepository.countInFlight(BOARD_ID)).thenReturn(1L);

        assertThat(service.dispatchNext(BOARD_ID)).isEmpty();
        verify(githubApiClient, never()).dispatchWorkflow(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("일일 상한에 도달하면 보내지 않는다")
    void respectsDailyLimit() {
        properties.setDailyLimit(5);
        when(jobRepository.countInFlight(BOARD_ID)).thenReturn(0L);
        when(jobRepository.countDispatchedSince(eq(BOARD_ID), any())).thenReturn(5L);

        assertThat(service.dispatchNext(BOARD_ID)).isEmpty();
        verify(githubApiClient, never()).dispatchWorkflow(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("워크플로가 기본 브랜치에 없으면 작업을 소진하지 않고 예외를 던진다")
    void failsFastWhenWorkflowMissing() {
        JiraAutofixJob job = queuedJob("QASA-1");
        givenNextQueued(job);
        when(githubApiClient.hasWorkflow("inst-1", REPO, "autofix.yaml")).thenReturn(false);

        assertThatThrownBy(() -> service.dispatchNext(BOARD_ID))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_WORKFLOW_NOT_FOUND);

        // 작업은 QUEUED로 남아야 한다 — 설정을 고치면 다음 주기에 다시 시도된다
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.QUEUED);
    }

    @Test
    @DisplayName("정상 디스패치 — inputs와 상태 전이")
    void dispatchesWithInputs() {
        JiraAutofixJob job = queuedJob("QASA-92");
        givenNextQueued(job);
        when(githubApiClient.hasWorkflow(any(), any(), any())).thenReturn(true);

        assertThat(service.dispatchNext(BOARD_ID)).isPresent();
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.DISPATCHED);
        assertThat(job.getDispatchedAt()).isNotNull();

        ArgumentCaptor<Map<String, String>> inputs = ArgumentCaptor.forClass(Map.class);
        verify(githubApiClient).dispatchWorkflow(
                eq("inst-1"), eq(REPO), eq("autofix.yaml"), eq("develop"), inputs.capture());
        assertThat(inputs.getValue())
                .containsEntry("issue_key", "QASA-92")
                .containsEntry("base_ref", "develop");
        // GitHub 제약: inputs 10개 이하
        assertThat(inputs.getValue()).hasSizeLessThanOrEqualTo(10);
    }

    @Test
    @DisplayName("콜백 토큰이 없으면 callback_url을 비워 보낸다 — 러너가 회신 단계를 건너뛴다")
    void emptyCallbackUrlWithoutToken() {
        JiraAutofixJob job = queuedJob("QASA-92");
        givenNextQueued(job);
        when(githubApiClient.hasWorkflow(any(), any(), any())).thenReturn(true);

        service.dispatchNext(BOARD_ID);

        ArgumentCaptor<Map<String, String>> inputs = ArgumentCaptor.forClass(Map.class);
        verify(githubApiClient).dispatchWorkflow(any(), any(), any(), any(), inputs.capture());
        assertThat(inputs.getValue()).containsEntry("callback_url", "");
    }

    // ── 콜백 ──────────────────────────────────────

    private JiraAutofixJob dispatchedJob(String key) {
        JiraAutofixJob job = queuedJob(key);
        job.markDispatched();
        when(jobRepository.findDispatchedByIssueKey(BOARD_ID, key)).thenReturn(Optional.of(job));
        return job;
    }

    private com.fasterxml.jackson.databind.JsonNode payload(String json) throws Exception {
        return new ObjectMapper().readTree(json);
    }

    @Test
    @DisplayName("성공 콜백 — PR URL이 있으면 SUCCEEDED")
    void callbackSuccess() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","status":"success","result":"changed",
                 "pr_url":"https://github.com/o/r/pull/1","run_url":"https://github.com/o/r/actions/runs/9"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
        assertThat(job.getPrUrl()).isEqualTo("https://github.com/o/r/pull/1");
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("성공했다고 해도 PR이 없으면 FAILED — PR이 산출물이다")
    void callbackSuccessWithoutPrIsFailure() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload(
                "{\"issue_key\":\"QASA-92\",\"status\":\"success\",\"result\":\"changed\",\"pr_url\":\"\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.FAILED);
    }

    @Test
    @DisplayName("변경이 없으면 NO_CHANGE — 실패와 구분한다")
    void callbackNoChange() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload(
                "{\"issue_key\":\"QASA-92\",\"status\":\"success\",\"result\":\"none\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.NO_CHANGE);
    }

    @Test
    @DisplayName("러너 실패는 FAILED")
    void callbackFailure() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload(
                "{\"issue_key\":\"QASA-92\",\"status\":\"failure\",\"result\":\"changed\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.FAILED);
    }

    @Test
    @DisplayName("중복 콜백은 무시한다 — 이미 종료된 작업을 되돌리지 않는다")
    void callbackIsIdempotent() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");
        String body = """
                {"issue_key":"QASA-92","status":"success","result":"changed",
                 "pr_url":"https://github.com/o/r/pull/1"}
                """;

        service.handleCallback(BOARD_ID, payload(body));
        // 두 번째는 DISPATCHED 조회에서 안 잡히지만, 잡히더라도 complete()가 막는다
        assertThat(job.complete(AutofixJobStatus.FAILED, null, null, "덮어쓰기 시도")).isFalse();
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
    }

    @Test
    @DisplayName("issue_key 없는 콜백은 조용히 무시한다")
    void callbackWithoutIssueKey() throws Exception {
        service.handleCallback(BOARD_ID, payload("{\"status\":\"success\"}"));
        verify(jobRepository, never()).findDispatchedByIssueKey(any(), any());
    }

    // ── 토큰 검증 ─────────────────────────────────

    @Test
    @DisplayName("콜백 토큰 — 저장된 값과 일치해야 통과")
    void verifiesCallbackToken() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        String token = config.ensureAutofixCallbackToken();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        assertThat(service.verifyCallbackToken(BOARD_ID, token)).isTrue();
        assertThat(service.verifyCallbackToken(BOARD_ID, "wrong")).isFalse();
        assertThat(service.verifyCallbackToken(BOARD_ID, null)).isFalse();
        assertThat(service.verifyCallbackToken(BOARD_ID, "")).isFalse();
    }

    @Test
    @DisplayName("토큰이 설정되지 않은 보드는 어떤 콜백도 받지 않는다")
    void rejectsCallbackWhenNoTokenConfigured() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        assertThat(service.verifyCallbackToken(BOARD_ID, "anything")).isFalse();
    }

    // ── 타임아웃 회수 ──────────────────────────────

    @Test
    @DisplayName("콜백이 안 온 작업을 회수한다 — 없으면 큐가 영구히 막힌다")
    void sweepsStaleDispatches() {
        JiraAutofixJob stale = queuedJob("QASA-1");
        stale.markDispatched();
        when(jobRepository.findStaleDispatched(any())).thenReturn(List.of(stale));

        assertThat(service.sweepStaleDispatches()).isEqualTo(1);
        assertThat(stale.getStatus()).isEqualTo(AutofixJobStatus.TIMED_OUT);
        assertThat(stale.getCompletedAt()).isNotNull();
    }

    // ── 취소 ──────────────────────────────────────

    @Test
    @DisplayName("QUEUED 작업만 취소할 수 있다")
    void cancelsQueuedJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        service.cancelJob(BOARD_ID, USER_ID, "job-1");

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
        verify(boardService).checkAdminOrAbove(BOARD_ID, USER_ID);
    }

    @Test
    @DisplayName("이미 나간 작업은 취소할 수 없다")
    void cannotCancelDispatchedJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markDispatched();
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
    }

    @Test
    @DisplayName("다른 보드의 작업은 취소할 수 없다")
    void cannotCancelOtherBoardsJob() {
        Board other = mock(Board.class);
        when(other.getId()).thenReturn("board-2");
        JiraAutofixJob job = JiraAutofixJob.builder()
                .board(other).jiraIssueKey("X-1").status(AutofixJobStatus.QUEUED)
                .queuedAt(LocalDateTime.now()).build();
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
    }
}
