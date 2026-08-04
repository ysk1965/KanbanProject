package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.GithubInstallation;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
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
 *
 * <p>작업은 러너가 claim으로 가져간다. 서버가 밀어 넣지 않으므로, 내주지 <b>않는</b> 조건이
 * 곧 가드레일이다.
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
    private JiraApiClient jiraApiClient;
    private JiraOAuthService oauthService;
    private JiraAutofixSlackPublisher slackPublisher;
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
        jiraApiClient = mock(JiraApiClient.class);
        oauthService = mock(JiraOAuthService.class);
        slackPublisher = mock(JiraAutofixSlackPublisher.class);

        service = new JiraAutofixQueueService(
                properties, new ObjectMapper(), boardRepository, boardService,
                triageRepository, jobRepository, configRepository, taskRepository,
                boardGithubRepoRepository, jiraApiClient, oauthService, slackPublisher);

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
        job.assignTarget("inst-1", REPO, "develop");
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
    @DisplayName("대상 저장소는 큐에 담는 시점에 스냅샷된다")
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

    // ── claim 가드레일 ────────────────────────────

    @Test
    @DisplayName("진행 중인 작업이 있으면 내주지 않는다 — 직렬 보장")
    void doesNotHandOutWhileInFlight() {
        properties.setDispatchEnabled(true);
        when(jobRepository.countInFlight(BOARD_ID)).thenReturn(1L);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("IN_FLIGHT");
        verify(jobRepository, never()).findByBoardIdAndStatus(any(), any(), any());
    }

    @Test
    @DisplayName("일일 상한에 도달하면 내주지 않는다")
    void respectsDailyLimit() {
        properties.setDispatchEnabled(true);
        properties.setDailyLimit(5);
        when(jobRepository.countInFlight(BOARD_ID)).thenReturn(0L);
        when(jobRepository.countDispatchedSince(eq(BOARD_ID), any())).thenReturn(5L);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("DAILY_LIMIT");
    }

    @Test
    @DisplayName("dispatch-enabled가 꺼져 있으면 큐가 차 있어도 내주지 않는다")
    void respectsDispatchDisabled() {
        properties.setDispatchEnabled(false);
        givenNextQueued(queuedJob("QASA-1"));

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("DISPATCH_DISABLED");
    }

    @Test
    @DisplayName("큐가 비면 이유를 담아 빈 결과를 준다 — 러너 로그에 원인이 남아야 한다")
    void reportsEmptyQueue() {
        properties.setDispatchEnabled(true);
        when(jobRepository.findByBoardIdAndStatus(eq(BOARD_ID), eq(AutofixJobStatus.QUEUED), any(Pageable.class)))
                .thenReturn(List.of());

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("EMPTY");
    }

    @Test
    @DisplayName("정상 claim — 명세와 상태 전이")
    void handsOutNextJob() {
        properties.setDispatchEnabled(true);
        JiraAutofixJob job = queuedJob("QASA-92");
        givenNextQueued(job);
        when(taskRepository.findById("task-QASA-92")).thenReturn(Optional.empty());

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getReason()).isEqualTo("CLAIMED");
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.DISPATCHED);
        assertThat(job.getDispatchedAt()).isNotNull();
        assertThat(job.getRunnerName()).isEqualTo("mac-01");

        JiraAutofixResponse.RunnerJob handed = result.getJob();
        assertThat(handed.getJiraIssueKey()).isEqualTo("QASA-92");
        assertThat(handed.getRepoFullName()).isEqualTo(REPO);
        assertThat(handed.getBaseRef()).isEqualTo("develop");
        // 브랜치 이름은 서버가 정한다 — 러너가 정하면 실행마다 규칙이 흔들린다
        assertThat(handed.getBranch()).isEqualTo("autofix/QASA-92");
    }

    @Test
    @DisplayName("러너 상한은 서버 회수 시각보다 짧게 내려간다 — 겹쳐 돌면 직렬 보장이 깨진다")
    void runnerTimeoutStaysBelowSweepDeadline() {
        properties.setDispatchEnabled(true);
        properties.setDispatchTimeoutMinutes(30);
        properties.setRunnerTimeoutMinutes(60);
        givenNextQueued(queuedJob("QASA-92"));

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob().getTimeoutMinutes()).isEqualTo(30);
    }

    @Test
    @DisplayName("대상 저장소가 없는 작업은 내주지 않고 실패시킨다 — 러너가 어디서 고칠지 모른다")
    void failsJobWithoutTarget() {
        properties.setDispatchEnabled(true);
        JiraAutofixJob job = JiraAutofixJob.builder()
                .board(board).jiraIssueKey("QASA-1").status(AutofixJobStatus.QUEUED)
                .queuedAt(LocalDateTime.now()).build();
        givenNextQueued(job);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("NO_TARGET");
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.FAILED);
    }

    @Test
    @DisplayName("내줄 게 없어도 러너를 봤다는 사실은 기록한다 — 화면의 '러너 연결됨' 근거")
    void recordsRunnerEvenWhenNothingToHandOut() {
        properties.setDispatchEnabled(true);
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));
        when(jobRepository.findByBoardIdAndStatus(eq(BOARD_ID), eq(AutofixJobStatus.QUEUED), any(Pageable.class)))
                .thenReturn(List.of());

        service.claim(BOARD_ID, "mac-01", null);

        assertThat(config.getAutofixRunnerSeenAt()).isNotNull();
        assertThat(config.getAutofixRunnerName()).isEqualTo("mac-01");
    }

    @Test
    @DisplayName("heartbeat는 생존 신고만 한다 — 긴 작업 중에는 claim을 부르지 않는다")
    void heartbeatTouchesRunnerOnly() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.heartbeat(BOARD_ID, "mac-01", null);

        assertThat(config.getAutofixRunnerSeenAt()).isNotNull();
        verify(jobRepository, never()).findByBoardIdAndStatus(any(), any(), any());
    }

    @Test
    @DisplayName("러너 자가진단은 서버가 아는 필드만 뽑아 저장한다 — 임의 값이 들어오는 통로가 되면 안 된다")
    void storesKnownRunnerStatusFieldsOnly() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        JiraAutofixRequest.RunnerStatus status = new JiraAutofixRequest.RunnerStatus();
        status.setDiskFreeGb(41.5);
        status.setUnityRunning(true);
        status.setVerifyReady(false);

        service.heartbeat(BOARD_ID, "mac-01", status);

        assertThat(config.getAutofixRunnerStatus())
                .contains("\"disk_free_gb\":41.5")
                .contains("\"verify_ready\":false");
    }

    @Test
    @DisplayName("진단을 안 보내면 마지막으로 알던 값을 지우지 않는다 — 모르는 것이 정상으로 보이면 안 된다")
    void keepsLastKnownStatusWhenOmitted() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        JiraAutofixRequest.RunnerStatus status = new JiraAutofixRequest.RunnerStatus();
        status.setVerifyReady(true);
        service.heartbeat(BOARD_ID, "mac-01", status);
        service.heartbeat(BOARD_ID, "mac-01", null);

        assertThat(config.getAutofixRunnerStatus()).contains("\"verify_ready\":true");
    }

    // ── 결과 회신 ──────────────────────────────────

    private JiraAutofixJob dispatchedJob(String key) {
        JiraAutofixJob job = queuedJob(key);
        job.markClaimed("mac-01");
        when(jobRepository.findDispatchedByIssueKey(BOARD_ID, key)).thenReturn(Optional.of(job));
        return job;
    }

    private com.fasterxml.jackson.databind.JsonNode payload(String json) throws Exception {
        return new ObjectMapper().readTree(json);
    }

    @Test
    @DisplayName("PR 회신 — pr_url이 있으면 SUCCEEDED")
    void callbackSuccess() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"pr",
                 "pr_url":"https://github.com/o/r/pull/1","log_excerpt":"...ok"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
        assertThat(job.getPrUrl()).isEqualTo("https://github.com/o/r/pull/1");
        assertThat(job.getLogExcerpt()).isEqualTo("...ok");
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("PR을 만들었다고 해도 URL이 없으면 FAILED — PR이 산출물이다")
    void callbackSuccessWithoutPrIsFailure() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload(
                "{\"issue_key\":\"QASA-92\",\"result\":\"pr\",\"pr_url\":\"\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.FAILED);
    }

    @Test
    @DisplayName("변경이 없으면 NO_CHANGE — 실패와 구분한다")
    void callbackNoChange() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload(
                "{\"issue_key\":\"QASA-92\",\"result\":\"no_change\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.NO_CHANGE);
        assertThat(job.getFailureReason()).isNull();
    }

    @Test
    @DisplayName("실패 회신은 사유를 남긴다 — 실행 로그 링크가 없으므로 이게 유일한 단서다")
    void callbackFailureKeepsReason() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"failed",
                 "failure_reason":"컴파일 실패: CS1002","log_excerpt":"Assets/Foo.cs(12,9): error CS1002"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.FAILED);
        assertThat(job.getFailureReason()).isEqualTo("컴파일 실패: CS1002");
        assertThat(job.getLogExcerpt()).contains("CS1002");
    }

    @Test
    @DisplayName("사유 없는 실패도 빈칸으로 남기지 않는다")
    void callbackFailureFallsBackToDefaultReason() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("{\"issue_key\":\"QASA-92\",\"result\":\"failed\"}"));

        assertThat(job.getFailureReason()).isNotBlank();
    }

    @Test
    @DisplayName("job_id로 매칭한다 — 같은 이슈를 두 번 돌린 경우에도 어긋나지 않는다")
    void callbackMatchesByJobId() throws Exception {
        JiraAutofixJob job = queuedJob("QASA-92");
        job.markClaimed("mac-01");
        when(jobRepository.findById("job-9")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("""
                {"job_id":"job-9","result":"pr","pr_url":"https://github.com/o/r/pull/1"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
        verify(jobRepository, never()).findDispatchedByIssueKey(any(), any());
    }

    @Test
    @DisplayName("다른 보드의 job_id로는 끝낼 수 없다")
    void callbackRejectsOtherBoardsJob() throws Exception {
        Board other = mock(Board.class);
        when(other.getId()).thenReturn("board-2");
        JiraAutofixJob job = JiraAutofixJob.builder()
                .board(other).jiraIssueKey("QASA-92").status(AutofixJobStatus.DISPATCHED)
                .queuedAt(LocalDateTime.now()).build();
        when(jobRepository.findById("job-9")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("{\"job_id\":\"job-9\",\"result\":\"pr\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.DISPATCHED);
    }

    @Test
    @DisplayName("중복 회신은 무시한다 — 이미 종료된 작업을 되돌리지 않는다")
    void callbackIsIdempotent() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"pr","pr_url":"https://github.com/o/r/pull/1"}
                """));
        // 두 번째는 DISPATCHED 조회에서 안 잡히지만, 잡히더라도 complete()가 막는다
        assertThat(job.complete(AutofixJobStatus.FAILED, null, "덮어쓰기 시도", null)).isFalse();
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
    }

    @Test
    @DisplayName("식별자 없는 회신은 조용히 무시한다")
    void callbackWithoutIdentifiers() throws Exception {
        service.handleCallback(BOARD_ID, payload("{\"result\":\"pr\"}"));
        verify(jobRepository, never()).findDispatchedByIssueKey(any(), any());
        verify(jobRepository, never()).findById(any());
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
        stale.markClaimed("mac-01");
        when(jobRepository.findStaleDispatched(any())).thenReturn(List.of(stale));

        assertThat(service.sweepStaleDispatches()).isEqualTo(1);
        assertThat(stale.getStatus()).isEqualTo(AutofixJobStatus.TIMED_OUT);
        assertThat(stale.getCompletedAt()).isNotNull();
    }

    // ── 슬랙 알림 ──────────────────────────────────

    @Test
    @DisplayName("결과가 확정되면 슬랙에도 남긴다 — 제목과 JIRA 주소를 값으로 넘긴다")
    void notifiesSlackOnResult() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");
        Task task = mock(Task.class);
        when(task.getTitle()).thenReturn("[문구] 프리셋 이름 오탈자");
        when(taskRepository.findById("task-QASA-92")).thenReturn(Optional.of(task));
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(
                JiraIntegrationConfig.builder().board(board).baseUrl("https://acme.atlassian.net").build()));

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"pr","pr_url":"https://github.com/o/r/pull/1"}
                """));

        verify(slackPublisher).publish(board, job, "[문구] 프리셋 이름 오탈자", "https://acme.atlassian.net");
    }

    @Test
    @DisplayName("타임아웃 회수도 알린다 — 아무도 요청하지 않은 종료라 알리지 않으면 아무도 모른다")
    void notifiesSlackOnTimeout() {
        JiraAutofixJob stale = queuedJob("QASA-1");
        stale.markClaimed("mac-01");
        when(jobRepository.findStaleDispatched(any())).thenReturn(List.of(stale));

        service.sweepStaleDispatches();

        verify(slackPublisher).publish(eq(board), eq(stale), any(), any());
    }

    @Test
    @DisplayName("슬랙 알림을 끄면 게시하지 않는다 — 연결은 그대로 두고 알림만 끈다")
    void slackNotifyCanBeDisabled() throws Exception {
        properties.setSlackNotifyEnabled(false);
        dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"no_change"}
                """));

        verifyNoInteractions(slackPublisher);
    }

    // ── 취소 ──────────────────────────────────────

    @Test
    @DisplayName("QUEUED 작업만 취소할 수 있다")
    void cancelsQueuedJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        service.cancelJob(BOARD_ID, USER_ID, "job-1", false);

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
        verify(boardService).checkAdminOrAbove(BOARD_ID, USER_ID);
    }

    @Test
    @DisplayName("이미 나간 작업은 일반 취소로는 되돌릴 수 없다")
    void cannotCancelDispatchedJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markClaimed("mac-01");
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1", false))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
    }

    @Test
    @DisplayName("force면 러너가 물고 있는 작업도 회수해 큐를 다시 흐르게 한다")
    void forceReleasesDispatchedJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markClaimed("mac-01");
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        service.cancelJob(BOARD_ID, USER_ID, "job-1", true);

        // CANCELLED이므로 같은 이슈를 다시 담을 수 있다(이슈당 1회 가드레일은 CANCELLED를 제외한다)
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
        assertThat(job.getCompletedAt()).isNotNull();
        assertThat(job.getFailureReason()).contains("회수");
    }

    @Test
    @DisplayName("force여도 이미 끝난 작업은 되살리지 않는다")
    void forceDoesNotTouchTerminalJob() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markClaimed("mac-01");
        job.complete(AutofixJobStatus.SUCCEEDED, "https://github.com/o/r/pull/1", null, null);
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1", true))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
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

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1", false))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
    }
}
