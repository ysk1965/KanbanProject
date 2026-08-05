package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.GithubInstallation;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.QaState;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

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
    private JiraAutofixJobMaterialRepository jobMaterialRepository;
    private FileUploadService fileUploadService;
    private JiraIntegrationConfigRepository configRepository;
    private TaskRepository taskRepository;
    private ChecklistItemRepository checklistItemRepository;
    private CommentRepository commentRepository;
    private UserRepository userRepository;
    private BoardGithubRepoRepository boardGithubRepoRepository;
    private JiraApiClient jiraApiClient;
    private JiraOAuthService oauthService;
    private CommentAttachmentRepository commentAttachmentRepository;
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
        jobMaterialRepository = mock(JiraAutofixJobMaterialRepository.class);
        fileUploadService = mock(FileUploadService.class);
        configRepository = mock(JiraIntegrationConfigRepository.class);
        taskRepository = mock(TaskRepository.class);
        checklistItemRepository = mock(ChecklistItemRepository.class);
        commentRepository = mock(CommentRepository.class);
        userRepository = mock(UserRepository.class);
        boardGithubRepoRepository = mock(BoardGithubRepoRepository.class);
        jiraApiClient = mock(JiraApiClient.class);
        oauthService = mock(JiraOAuthService.class);
        commentAttachmentRepository = mock(CommentAttachmentRepository.class);
        slackPublisher = mock(JiraAutofixSlackPublisher.class);

        service = new JiraAutofixQueueService(
                properties, new ObjectMapper(), boardRepository, boardService,
                triageRepository, jobRepository, jobMaterialRepository, fileUploadService,
                configRepository, taskRepository,
                checklistItemRepository, commentRepository, commentAttachmentRepository,
                userRepository,
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
        lenient().when(commentRepository.findByTaskIdWithAuthor(any())).thenReturn(List.of());
        lenient().when(commentAttachmentRepository.findByTaskId(any())).thenReturn(List.of());
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
        JiraAutofixJob job = JiraAutofixJob.forJiraIssue(board, key, "task-" + key, 0.9);
        job.assignTarget("inst-1", REPO, "develop");
        return job;
    }

    private void givenNextQueued(JiraAutofixJob job) {
        when(jobRepository.findByBoardIdAndStatus(eq(BOARD_ID), eq(AutofixJobStatus.QUEUED), any(Pageable.class)))
                .thenReturn(List.of(job));
    }

    /** PR까지 간 작업 하나. 다시 담기의 주 대상이다. */
    private JiraAutofixJob succeededJob(String key) {
        JiraAutofixJob job = queuedJob(key);
        job.markClaimed("mac-01");
        job.complete(AutofixJobStatus.SUCCEEDED, "https://github.com/o/r/pull/7", null, null);
        when(jobRepository.findById(job.getId())).thenReturn(Optional.of(job));
        return job;
    }

    /** 다시 담기가 저장한 새 작업. */
    private JiraAutofixJob capturedRequeued() {
        ArgumentCaptor<JiraAutofixJob> captor = ArgumentCaptor.forClass(JiraAutofixJob.class);
        verify(jobRepository).save(captor.capture());
        return captor.getValue();
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

    /** 판정 이후 상태가 바뀐 태스크를 조회 결과에 심는다. 담기가 실제로 읽는 경로를 그대로 태운다. */
    private void givenTasks(Task... tasks) {
        when(taskRepository.findByIdInWithBlockAndFeature(anyList())).thenReturn(List.of(tasks));
    }

    private Task taskOf(String key, boolean completed, QaState qaState) {
        Task task = Task.builder()
                .id("task-" + key)
                .title(key + " 오탈자")
                .isCompleted(completed)
                .build();
        task.applyQaState(qaState);
        return task;
    }

    @Test
    @DisplayName("이미 끝난 태스크는 담지 않는다 — 판정은 스냅샷이라 그 뒤 완료된 건이 후보에 남는다")
    void skipsAlreadyDoneTask() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9), candidate("QASA-2", 0.9));
        givenTasks(taskOf("QASA-1", false, null), taskOf("QASA-2", true, null));

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isEqualTo(1);
        assertThat(result.getSkippedAlreadyDone()).isEqualTo(1);
    }

    @Test
    @DisplayName("QA가 물고 있는 태스크도 담지 않는다")
    void skipsTaskHeldByQa() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9));
        givenTasks(taskOf("QASA-1", false, QaState.REVIEW));

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isZero();
        assertThat(result.getSkippedAlreadyDone()).isEqualTo(1);
    }

    @Test
    @DisplayName("QA 반려는 담는다 — 되돌려 보냈다는 건 아직 안 고쳐졌다는 뜻이다")
    void enqueuesRejectedTask() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9));
        givenTasks(taskOf("QASA-1", false, QaState.REJECTED));

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isEqualTo(1);
        assertThat(result.getSkippedAlreadyDone()).isZero();
    }

    @Test
    @DisplayName("태스크를 못 찾아도 담는다 — 연동이 끊긴 건까지 막으면 후보가 조용히 사라진다")
    void enqueuesWhenTaskMissing() {
        givenRepo("develop");
        givenCandidates(candidate("QASA-1", 0.9));
        givenTasks();  // 조회 결과 없음

        JiraAutofixResponse.EnqueueResult result = service.enqueueCandidates(BOARD_ID, USER_ID, null, null);

        assertThat(result.getQueued()).isEqualTo(1);
        assertThat(result.getSkippedAlreadyDone()).isZero();
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
                .extracting(JiraAutofixJob::getJobKey).isEqualTo("QASA-2");
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
    @DisplayName("계약이 낡은 러너에게는 작업을 내주지 않는다 — 큐는 그대로 남는다")
    void rejectsOutdatedRunnerContract() {
        properties.setDispatchEnabled(true);
        givenNextQueued(queuedJob("QASA-1"));

        JiraAutofixResponse.ClaimResult result =
                service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION - 1, null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("CONTRACT_MISMATCH");
        // 서버 버전을 함께 알려줘야 러너 로그가 두 숫자를 나란히 찍을 수 있다.
        assertThat(result.getContractVersion()).isEqualTo(AutofixRunnerContract.VERSION);
        // 핵심: 작업을 꺼내지도 않았다. 낡은 러너에 내주면 그 건은 실패로 타버린다.
        verify(jobRepository, never()).findByBoardIdAndStatus(any(), any(), any());
    }

    @Test
    @DisplayName("계약 버전을 아예 보내지 않는 러너도 불일치로 본다")
    void rejectsRunnerWithoutContractVersion() {
        properties.setDispatchEnabled(true);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", null, null);

        assertThat(result.getReason()).isEqualTo("CONTRACT_MISMATCH");
    }

    @Test
    @DisplayName("진행 중인 작업이 있으면 내주지 않는다 — 직렬 보장")
    void doesNotHandOutWhileInFlight() {
        properties.setDispatchEnabled(true);
        when(jobRepository.countInFlight(BOARD_ID)).thenReturn(1L);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

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

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("DAILY_LIMIT");
    }

    @Test
    @DisplayName("dispatch-enabled가 꺼져 있으면 큐가 차 있어도 내주지 않는다")
    void respectsDispatchDisabled() {
        properties.setDispatchEnabled(false);
        givenNextQueued(queuedJob("QASA-1"));

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(result.getJob()).isNull();
        assertThat(result.getReason()).isEqualTo("DISPATCH_DISABLED");
    }

    @Test
    @DisplayName("큐가 비면 이유를 담아 빈 결과를 준다 — 러너 로그에 원인이 남아야 한다")
    void reportsEmptyQueue() {
        properties.setDispatchEnabled(true);
        when(jobRepository.findByBoardIdAndStatus(eq(BOARD_ID), eq(AutofixJobStatus.QUEUED), any(Pageable.class)))
                .thenReturn(List.of());

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

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

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(result.getReason()).isEqualTo("CLAIMED");
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.DISPATCHED);
        assertThat(job.getDispatchedAt()).isNotNull();
        assertThat(job.getRunnerName()).isEqualTo("mac-01");

        JiraAutofixResponse.RunnerJob handed = result.getJob();
        assertThat(handed.getJobKey()).isEqualTo("QASA-92");
        assertThat(handed.getRepoFullName()).isEqualTo(REPO);
        assertThat(handed.getBaseRef()).isEqualTo("develop");
        // 브랜치 이름은 서버가 정한다 — 러너가 정하면 실행마다 규칙이 흔들린다.
        // 뒤에 job id를 붙이는 이유는 재시도다: 대상 키로만 정하면 remote에 남은 이전 브랜치와
        // non-fast-forward로 부딪혀 push가 실패한다.
        assertThat(handed.getBranch()).startsWith("autofix/QASA-92-");
    }

    @Test
    @DisplayName("러너 상한은 서버 회수 시각보다 짧게 내려간다 — 겹쳐 돌면 직렬 보장이 깨진다")
    void runnerTimeoutStaysBelowSweepDeadline() {
        properties.setDispatchEnabled(true);
        properties.setDispatchTimeoutMinutes(30);
        properties.setRunnerTimeoutMinutes(60);
        givenNextQueued(queuedJob("QASA-92"));

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(result.getJob().getTimeoutMinutes()).isEqualTo(30);
    }

    @Test
    @DisplayName("대상 저장소가 없는 작업은 내주지 않고 실패시킨다 — 러너가 어디서 고칠지 모른다")
    void failsJobWithoutTarget() {
        properties.setDispatchEnabled(true);
        // 대상을 지정하지 않은(assignTarget 미호출) 작업
        JiraAutofixJob job = JiraAutofixJob.forJiraIssue(board, "QASA-1", null, 0.9);
        givenNextQueued(job);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

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

        service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(config.getAutofixRunnerSeenAt()).isNotNull();
        assertThat(config.getAutofixRunnerName()).isEqualTo("mac-01");
    }

    @Test
    @DisplayName("heartbeat는 생존 신고만 한다 — 긴 작업 중에는 claim을 부르지 않는다")
    void heartbeatTouchesRunnerOnly() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.heartbeat(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(config.getAutofixRunnerSeenAt()).isNotNull();
        verify(jobRepository, never()).findByBoardIdAndStatus(any(), any(), any());
    }

    /**
     * 실제 러너의 하트비트 페이로드는 {@code {runner_name}}뿐이다 — 계약 버전이 없다.
     *
     * <p>그 null을 기록에 반영하면, 작업이 도는 동안(러너가 바빠 claim하지 않는 구간) 기록된
     * 버전이 지워진 채 남아 도크가 "스크립트가 낡았습니다"를 띄우고 드리프트 알림이 슬랙으로
     * 나간다. 정작 배분 게이트는 claim이 실어 보낸 값을 보므로 큐는 멀쩡히 돈다.
     *
     * <p>이 버그가 빠져나간 이유는 기존 하트비트 테스트가 전부 버전을 넘겨서다 — 실제 러너가
     * 하지 않는 일을 테스트가 대신 해주고 있었다.
     */
    @Test
    @DisplayName("하트비트는 기록된 계약 버전을 지우지 않는다 — 러너는 하트비트에 버전을 싣지 않는다")
    void heartbeatWithoutContractKeepsRecordedVersion() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);
        assertThat(config.getAutofixRunnerContract()).isEqualTo(AutofixRunnerContract.VERSION);

        service.heartbeat(BOARD_ID, "mac-01", null, null);

        assertThat(config.getAutofixRunnerContract()).isEqualTo(AutofixRunnerContract.VERSION);
        // 생존 신고 자체는 그대로 반영돼야 한다 — 안 그러면 무응답 알림이 잘못 울린다.
        assertThat(config.getAutofixRunnerSeenAt()).isNotNull();
    }

    @Test
    @DisplayName("하트비트가 버전을 실어 보내면 그때는 반영한다 — 러너가 낡아진 것을 늦게 알 이유가 없다")
    void heartbeatWithContractIsHonoured() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);
        service.heartbeat(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION - 1, null);

        assertThat(config.getAutofixRunnerContract()).isEqualTo(AutofixRunnerContract.VERSION - 1);
    }

    @Test
    @DisplayName("claim이 버전을 안 밝히면 그것은 기록에 남는다 — 구버전 러너를 화면이 가리켜야 한다")
    void claimWithoutContractClearsRecordedVersion() {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);
        service.claim(BOARD_ID, "mac-01", null, null);

        assertThat(config.getAutofixRunnerContract()).isNull();
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

        service.heartbeat(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, status);

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
        service.heartbeat(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, status);
        service.heartbeat(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(config.getAutofixRunnerStatus()).contains("\"verify_ready\":true");
    }

    // ── 결과 회신 ──────────────────────────────────

    private JiraAutofixJob dispatchedJob(String key) {
        JiraAutofixJob job = queuedJob(key);
        job.markClaimed("mac-01");
        when(jobRepository.findCallbackTargetsByJobKey(BOARD_ID, key)).thenReturn(List.of(job));
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
                {"job_key":"QASA-92","result":"pr",
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
                {"job_key":"QASA-92","result":"failed",
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
        verify(jobRepository, never()).findCallbackTargetsByJobKey(any(), any());
    }

    @Test
    @DisplayName("다른 보드의 job_id로는 끝낼 수 없다")
    void callbackRejectsOtherBoardsJob() throws Exception {
        Board other = mock(Board.class);
        when(other.getId()).thenReturn("board-2");
        JiraAutofixJob job = JiraAutofixJob.forJiraIssue(other, "QASA-92", null, 0.9);
        job.markClaimed("mac-01");
        when(jobRepository.findById("job-9")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("{\"job_id\":\"job-9\",\"result\":\"pr\"}"));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.DISPATCHED);
    }

    @Test
    @DisplayName("중복 회신은 무시한다 — 이미 종료된 작업을 되돌리지 않는다")
    void callbackIsIdempotent() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"job_key":"QASA-92","result":"pr","pr_url":"https://github.com/o/r/pull/1"}
                """));
        // 두 번째는 DISPATCHED 조회에서 안 잡히지만, 잡히더라도 complete()가 막는다
        assertThat(job.complete(AutofixJobStatus.FAILED, null, "덮어쓰기 시도", null)).isFalse();
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
    }

    @Test
    @DisplayName("식별자 없는 회신은 조용히 무시한다")
    void callbackWithoutIdentifiers() throws Exception {
        service.handleCallback(BOARD_ID, payload("{\"result\":\"pr\"}"));
        verify(jobRepository, never()).findCallbackTargetsByJobKey(any(), any());
        verify(jobRepository, never()).findById(any());
    }

    // ── 사람이 직접 맡기기 ──────────────────────────

    private static final String TASK_ID = "task-99";

    private Task givenDelegatableTask() {
        Task task = mock(Task.class);
        com.kanban.domain.block.Block block = mock(com.kanban.domain.block.Block.class);
        lenient().when(block.getBoard()).thenReturn(board);
        lenient().when(task.getId()).thenReturn(TASK_ID);
        lenient().when(task.getBlock()).thenReturn(block);
        lenient().when(task.getTitle()).thenReturn("프리셋 관리 팝업 개선");
        lenient().when(task.getDescription()).thenReturn("저장 흐름 전반을 손본다");
        lenient().when(taskRepository.findById(TASK_ID)).thenReturn(Optional.of(task));
        return task;
    }

    private ChecklistItem givenItem(String id, String title) {
        ChecklistItem item = mock(ChecklistItem.class);
        lenient().when(item.getId()).thenReturn(id);
        lenient().when(item.getTitle()).thenReturn(title);
        lenient().when(checklistItemRepository.findById(id)).thenReturn(Optional.of(item));
        return item;
    }

    private JiraAutofixRequest.Delegate delegateRequest(String instruction, List<String> itemIds) {
        JiraAutofixRequest.Delegate request = new JiraAutofixRequest.Delegate();
        request.setTaskId(TASK_ID);
        request.setInstruction(instruction);
        request.setChecklistItemIds(itemIds);
        return request;
    }

    @Test
    @DisplayName("체크리스트 항목 3개를 고르면 job도 3개다 — 실패 단위가 섞이면 성공한 것까지 버려진다")
    void delegatesOneJobPerChecklistItem() {
        givenRepo("develop");
        givenDelegatableTask();
        // 중첩 stubbing이 되지 않게 항목을 먼저 만들어 둔다
        List<ChecklistItem> items = List.of(
                givenItem("item-1", "빈 이름일 때 저장 버튼 비활성화"),
                givenItem("item-2", "중복 이름 검사 추가"),
                givenItem("item-3", "삭제 확인 팝업"));
        when(checklistItemRepository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(items);

        JiraAutofixResponse.DelegateResult result = service.delegate(BOARD_ID, USER_ID,
                delegateRequest("공백 이름을 막아라", List.of("item-1", "item-2", "item-3")));

        assertThat(result.getQueued()).isEqualTo(3);
        ArgumentCaptor<List<JiraAutofixJob>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).hasSize(3)
                .allSatisfy(job -> {
                    assertThat(job.getJobKind()).isEqualTo(AutofixJobKind.MANUAL);
                    assertThat(job.getJobKey()).startsWith("CHK-");
                    assertThat(job.getTaskId()).isEqualTo(TASK_ID);   // 맥락은 항상 부모 태스크에서 온다
                    assertThat(job.getConfidence()).isNull();          // 수동에는 점수가 없다
                });
        // 브랜치가 겹치면 두 번째 push부터 non-fast-forward로 실패한다
        assertThat(saved.getValue()).extracting(JiraAutofixJob::getBranchName).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("항목을 고르지 않으면 태스크 전체를 맡긴다")
    void delegatesWholeTaskWhenNoItemsChosen() {
        givenRepo("develop");
        givenDelegatableTask();

        JiraAutofixResponse.DelegateResult result =
                service.delegate(BOARD_ID, USER_ID, delegateRequest("카드 전체를 손봐라", List.of()));

        assertThat(result.getQueued()).isEqualTo(1);
        ArgumentCaptor<List<JiraAutofixJob>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).singleElement().satisfies(job -> {
            assertThat(job.getJobKey()).startsWith("TASK-");
            assertThat(job.getChecklistItemId()).isNull();
        });
    }

    @Test
    @DisplayName("다른 태스크의 체크리스트 항목은 거부한다 — 맥락 조립이 엉뚱한 설명을 붙인다")
    void rejectsChecklistItemFromAnotherTask() {
        givenRepo("develop");
        givenDelegatableTask();
        List<ChecklistItem> items = List.of(givenItem("item-1", "이 태스크의 항목"));
        when(checklistItemRepository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(items);

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID,
                delegateRequest("고쳐라", List.of("item-from-other-task"))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_INVALID_CHECKLIST_ITEM);
    }

    @Test
    @DisplayName("이미 맡긴 항목은 건너뛰고 나머지는 담는다")
    void skipsAlreadyDelegatedItems() {
        givenRepo("develop");
        givenDelegatableTask();
        List<ChecklistItem> items = List.of(
                givenItem("item-1", "이미 진행 중"), givenItem("item-2", "아직 안 맡김"));
        when(checklistItemRepository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(items);
        when(jobRepository.existsPendingForChecklistItem(BOARD_ID, "item-1")).thenReturn(true);

        JiraAutofixResponse.DelegateResult result = service.delegate(BOARD_ID, USER_ID,
                delegateRequest("고쳐라", List.of("item-1", "item-2")));

        assertThat(result.getQueued()).isEqualTo(1);
        assertThat(result.getSkippedAlreadyDelegated()).isEqualTo(1);
    }

    @Test
    @DisplayName("지시문이 비면 담지 않는다")
    void requiresInstruction() {
        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID, delegateRequest("   ", List.of())))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_INSTRUCTION_REQUIRED);
    }

    @Test
    @DisplayName("검증 클론이 없다고 러너가 보고했으면 담지 않는다 — 40분 뒤 PR 직전에 실패한다")
    void refusesWhenRunnerVerifyNotReady() {
        JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
        when(config.getAutofixRunnerStatus()).thenReturn("{\"verify_ready\":false}");
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));
        givenDelegatableTask();

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID, delegateRequest("고쳐라", List.of())))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_RUNNER_NOT_READY);
    }

    @Test
    @DisplayName("러너 상태를 모르면 막지 않는다 — 모르는 것을 문제로 취급하면 멀쩡한 맥을 세운다")
    void unknownRunnerStatusDoesNotBlock() {
        givenRepo("develop");
        givenDelegatableTask();
        JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
        when(config.getAutofixRunnerStatus()).thenReturn("{\"disk_free_gb\":45}");
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        assertThat(service.delegate(BOARD_ID, USER_ID, delegateRequest("고쳐라", List.of()))
                .getQueued()).isEqualTo(1);
    }

    @Test
    @DisplayName("수동 작업은 큐에서 QA 후보보다 앞에 선다 — 사람이 지금 기다리고 있다")
    void manualJobsSortAheadOfJiraJobs() {
        // 정렬은 리포지토리 쿼리가 책임진다. 여기서는 claim이 그 순서를 그대로 따르는지만 본다.
        properties.setDispatchEnabled(true);
        givenDelegatableTask();
        JiraAutofixJob manual = JiraAutofixJob.forManualTask(board, TASK_ID, "고쳐라", USER_ID);
        manual.assignTarget("inst-1", REPO, "develop");
        givenNextQueued(manual);

        JiraAutofixResponse.ClaimResult result = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null);

        assertThat(result.getReason()).isEqualTo("CLAIMED");
        assertThat(result.getJob().getJobKind()).isEqualTo("MANUAL");
    }

    @Test
    @DisplayName("체크리스트 위임 명세 — 맥락은 부모 태스크, 범위는 항목 하나")
    void checklistInstructionCarriesParentContextAndScope() {
        properties.setDispatchEnabled(true);
        givenDelegatableTask();
        givenItem("item-1", "빈 이름일 때 저장 버튼 비활성화");
        JiraAutofixJob job = JiraAutofixJob.forManualChecklistItem(
                board, TASK_ID, "item-1", "공백 이름을 막아라", USER_ID);
        job.assignTarget("inst-1", REPO, "develop");
        givenNextQueued(job);

        JiraAutofixResponse.RunnerJob handed = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null).getJob();

        // PR 제목은 항목 제목이다 — 태스크 제목이면 리뷰어가 카드 전체 변경을 기대한다
        assertThat(handed.getTitle()).isEqualTo("빈 이름일 때 저장 버튼 비활성화");
        assertThat(handed.getInstruction())
                .contains("프리셋 관리 팝업 개선")          // 맥락: 부모 태스크 제목
                .contains("저장 흐름 전반을 손본다")        // 맥락: 부모 태스크 설명
                .contains("빈 이름일 때 저장 버튼 비활성화") // 대상: 항목 제목
                .contains("다른 항목은 건드리지 않는다")     // 범위 제한 — 이게 없으면 카드 전체를 고친다
                .contains("공백 이름을 막아라");            // 지시: 사람이 쓴 문장
    }

    @Test
    @DisplayName("수동 작업 결과는 JIRA가 아니라 맡긴 카드에 남는다")
    void manualResultGoesToTaskComment() throws Exception {
        givenDelegatableTask();
        givenItem("item-1", "빈 이름일 때 저장 버튼 비활성화");
        JiraAutofixJob job = JiraAutofixJob.forManualChecklistItem(
                board, TASK_ID, "item-1", "공백 이름을 막아라", USER_ID);
        job.assignTarget("inst-1", REPO, "develop");
        job.markClaimed("mac-01");
        when(jobRepository.findById("job-m")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("""
                {"job_id":"job-m","result":"pr","pr_url":"https://github.com/o/r/pull/9"}
                """));

        ArgumentCaptor<Comment> comment = ArgumentCaptor.forClass(Comment.class);
        verify(commentRepository).save(comment.capture());
        assertThat(comment.getValue().getContent())
                .contains("체크리스트: 빈 이름일 때 저장 버튼 비활성화")
                .contains("https://github.com/o/r/pull/9")
                .contains("항목 체크는 켜지 않았습니다");   // PR은 머지가 아니다
        verifyNoInteractions(jiraApiClient);
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

    // ── 변경 없음의 산출물 ────────────────────────

    /**
     * 로컬라이즈 정본이 저장소 밖일 때 올바른 결과는 PR이 아니라 보고다. 그 보고가 JIRA 댓글에만
     * 남으면, 사람이 그 건을 보는 자리(BRIDGE 카드)에는 회색 "변경 없음" 칩 하나만 뜬다.
     */
    private static final String LOCALE_REPORT_LOG = """
            저장소에서 고칠 것을 찾지 못했습니다.

              [로컬라이즈 원본 수정 필요]
              - 항목: #id `4`, key `MSG_NOT_ENOUGH_AP`
              - 언어: kr
              - 현재: 행동력이 부족합니다.
              - 변경: 스테미너가 부족합니다.
            """;

    @Test
    @DisplayName("변경 없음이어도 보고가 있으면 카드에도 남긴다 — 그 보고가 이 건의 산출물이다")
    void noChangeWithReportAlsoGoesToCard() throws Exception {
        dispatchedJob("QASA-116");
        when(taskRepository.findById("task-QASA-116")).thenReturn(Optional.of(mock(Task.class)));

        service.handleCallback(BOARD_ID, payload(new ObjectMapper().writeValueAsString(
                Map.of("issue_key", "QASA-116", "result", "no_change",
                        "log_excerpt", LOCALE_REPORT_LOG))));

        ArgumentCaptor<Comment> comment = ArgumentCaptor.forClass(Comment.class);
        verify(commentRepository).save(comment.capture());
        assertThat(comment.getValue().getContent())
                .contains("MSG_NOT_ENOUGH_AP")
                .contains("스테미너가 부족합니다")
                // 값을 그대로 옮겨 적게 두지 않는다 — 키가 맞는지 대조하라고 말해야 한다.
                .contains("확인 후 반영");
    }

    @Test
    @DisplayName("보고가 없으면 카드는 건드리지 않는다 — 결과 통보가 두 벌로 쌓이면 카드가 알림판이 된다")
    void noChangeWithoutReportLeavesCardAlone() throws Exception {
        dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-92","result":"no_change","log_excerpt":"빌드 로그만 잔뜩"}
                """));

        verify(commentRepository, never()).save(any());
    }

    @Test
    @DisplayName("JIRA 댓글도 보고를 싣는다 — 한 문장짜리 통보로 덮어쓰지 않는다")
    void jiraCommentCarriesReport() throws Exception {
        dispatchedJob("QASA-116");
        when(taskRepository.findById("task-QASA-116")).thenReturn(Optional.of(mock(Task.class)));
        when(configRepository.findActiveByBoardId(BOARD_ID)).thenReturn(Optional.of(
                JiraIntegrationConfig.builder().board(board).baseUrl("https://acme.atlassian.net").build()));

        service.handleCallback(BOARD_ID, payload(new ObjectMapper().writeValueAsString(
                Map.of("issue_key", "QASA-116", "result", "no_change",
                        "log_excerpt", LOCALE_REPORT_LOG))));

        ArgumentCaptor<com.fasterxml.jackson.databind.JsonNode> adf =
                ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);
        verify(jiraApiClient).addComment(any(), eq("QASA-116"), adf.capture());
        assertThat(adf.getValue().toString()).contains("MSG_NOT_ENOUGH_AP");
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
                {"job_key":"QASA-92","result":"pr","pr_url":"https://github.com/o/r/pull/1"}
                """));

        verify(slackPublisher).publish(board, job, "[문구] 프리셋 이름 오탈자",
                "https://acme.atlassian.net", null, false);
    }

    @Test
    @DisplayName("전용 채널을 지정했으면 그 채널로 넘긴다 — 기본 채널로 새지 않아야 한다")
    void notifiesSlackToConfiguredChannel() throws Exception {
        JiraAutofixJob job = dispatchedJob("QASA-93");
        JiraIntegrationConfig config = JiraIntegrationConfig.builder()
                .board(board).baseUrl("https://acme.atlassian.net").build();
        config.updateAutofixSlackChannel("C0AUTOFIX", "qa-autofix");
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        service.handleCallback(BOARD_ID, payload("""
                {"issue_key":"QASA-93","result":"no_change"}
                """));

        verify(slackPublisher).publish(eq(board), eq(job), any(),
                eq("https://acme.atlassian.net"), eq("C0AUTOFIX"), eq(false));
    }

    @Test
    @DisplayName("타임아웃 회수도 알린다 — 아무도 요청하지 않은 종료라 알리지 않으면 아무도 모른다")
    void notifiesSlackOnTimeout() {
        JiraAutofixJob stale = queuedJob("QASA-1");
        stale.markClaimed("mac-01");
        when(jobRepository.findStaleDispatched(any())).thenReturn(List.of(stale));

        service.sweepStaleDispatches();

        verify(slackPublisher).publish(eq(board), eq(stale), any(), any(), any(), eq(false));
    }

    @Test
    @DisplayName("슬랙 알림을 끄면 게시하지 않는다 — 연결은 그대로 두고 알림만 끈다")
    void slackNotifyCanBeDisabled() throws Exception {
        properties.setSlackNotifyEnabled(false);
        dispatchedJob("QASA-92");

        service.handleCallback(BOARD_ID, payload("""
                {"job_key":"QASA-92","result":"no_change"}
                """));

        verifyNoInteractions(slackPublisher);
    }

    // ── 늦은 회신 (회수 정정) ───────────────────────

    @Test
    @DisplayName("회수된 뒤 도착한 회신이 결과를 바로잡는다 — TIMED_OUT은 추정이지 사실이 아니다")
    void lateCallbackCorrectsTimedOut() throws Exception {
        JiraAutofixJob job = queuedJob("QASA-95");
        job.markClaimed("mac-01");
        job.markTimedOut();
        when(jobRepository.findById("job-95")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("""
                {"job_id":"job-95","result":"pr","pr_url":"https://github.com/o/r/pull/9"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
        assertThat(job.getPrUrl()).isEqualTo("https://github.com/o/r/pull/9");
        // 채널에 이미 "시간 초과 회수"가 올라가 있으므로 정정임을 밝혀야 한다
        verify(slackPublisher).publish(eq(board), eq(job), any(), any(), any(), eq(true));
    }

    @Test
    @DisplayName("사람이 취소한 건은 늦은 회신으로 되살아나지 않는다")
    void lateCallbackDoesNotRevivedCancelled() throws Exception {
        JiraAutofixJob job = queuedJob("QASA-96");
        job.markClaimed("mac-01");
        job.complete(AutofixJobStatus.CANCELLED, null, null, null);
        when(jobRepository.findById("job-96")).thenReturn(Optional.of(job));

        service.handleCallback(BOARD_ID, payload("""
                {"job_id":"job-96","result":"pr","pr_url":"https://github.com/o/r/pull/9"}
                """));

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
        verifyNoInteractions(slackPublisher);
    }

    @Test
    @DisplayName("확정된 결과는 늦은 회신으로 뒤집히지 않는다 — 정정 대상은 TIMED_OUT 하나뿐")
    void lateCallbackDoesNotOverwriteSettledResult() throws Exception {
        JiraAutofixJob job = queuedJob("QASA-97");
        job.markClaimed("mac-01");
        job.complete(AutofixJobStatus.NO_CHANGE, null, null, null);

        assertThat(job.reconcileAfterTimeout(AutofixJobStatus.SUCCEEDED, "https://x/1", null, null))
                .isFalse();
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.NO_CHANGE);
    }

    // ── 러너 무응답 알림 ────────────────────────────

    private JiraIntegrationConfig silentRunnerConfig(int minutesAgo) {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        config.touchAutofixRunner("mac-01", null, AutofixRunnerContract.VERSION);
        // seenAt은 touch가 현재 시각으로 넣으므로, 과거로 보이도록 조회 자체를 스텁한다
        when(configRepository.findRunnersGoneSilent(any())).thenReturn(List.of(config));
        return config;
    }

    @Test
    @DisplayName("러너가 조용하고 대기 건이 있으면 알린다 — 이게 없으면 죽은 러너는 아무 신호도 내지 않는다")
    void alertsWhenRunnerGoesSilentWithWork() {
        JiraIntegrationConfig config = silentRunnerConfig(30);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(3L);

        assertThat(service.alertOfflineRunners()).isEqualTo(1);

        verify(slackPublisher).publishRunnerOffline(eq(board), eq("mac-01"), any(), eq(3), any());
        assertThat(config.getAutofixRunnerOfflineAlertedAt()).isNotNull();
    }

    @Test
    @DisplayName("시킬 일이 없으면 알리지 않는다 — 손해 없는 시점에 부르면 정작 필요할 때 무시당한다")
    void doesNotAlertWhenQueueIsEmpty() {
        silentRunnerConfig(30);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(0L);

        assertThat(service.alertOfflineRunners()).isZero();

        verifyNoInteractions(slackPublisher);
    }

    @Test
    @DisplayName("알림을 껐으면 표식만 남기고 게시하지 않는다")
    void marksButDoesNotPostWhenSlackDisabled() {
        properties.setSlackNotifyEnabled(false);
        JiraIntegrationConfig config = silentRunnerConfig(30);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(2L);

        assertThat(service.alertOfflineRunners()).isEqualTo(1);

        verifyNoInteractions(slackPublisher);
        assertThat(config.getAutofixRunnerOfflineAlertedAt()).isNotNull();
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
    @DisplayName("force면 회수된 작업(TIMED_OUT)을 비워 다시 담을 수 있게 한다")
    void forceDiscardsTimedOutJobForRetry() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markClaimed("mac-01");
        job.markTimedOut();
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        service.cancelJob(BOARD_ID, USER_ID, "job-1", true);

        // 회수는 "러너가 죽었다는 추정"일 뿐이다. 이 경로가 없으면 그 추정 하나로 대상이 영구히 빠진다.
        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
        assertThat(job.getFailureReason()).contains("다시 담을 수 있습니다");
    }

    @Test
    @DisplayName("force면 실패한 작업도 비워 다시 담을 수 있게 한다")
    void forceDiscardsFailedJobForRetry() {
        JiraAutofixJob job = queuedJob("QASA-1");
        job.markClaimed("mac-01");
        job.complete(AutofixJobStatus.FAILED, null, "러너 스크립트가 낡았습니다", null);
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        service.cancelJob(BOARD_ID, USER_ID, "job-1", true);

        assertThat(job.getStatus()).isEqualTo(AutofixJobStatus.CANCELLED);
    }

    @Test
    @DisplayName("force여도 PR이 열린 작업은 되살리지 않는다 — 같은 대상에 PR이 둘 생긴다")
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
        JiraAutofixJob job = JiraAutofixJob.forJiraIssue(other, "X-1", null, 0.9);
        when(jobRepository.findById("job-1")).thenReturn(Optional.of(job));

        assertThatThrownBy(() -> service.cancelJob(BOARD_ID, USER_ID, "job-1", false))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
    }

    // ── 자료 전달 (스크린샷·댓글) ────────────────────

    private Comment commentAt(String author, String body, int minute) {
        User user = mock(User.class);
        lenient().when(user.getName()).thenReturn(author);
        Comment c = mock(Comment.class);
        lenient().when(c.getAuthor()).thenReturn(user);
        lenient().when(c.getContent()).thenReturn(body);
        lenient().when(c.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 8, 5, 10, minute));
        return c;
    }

    private CommentAttachment material(String name, String mime, String url) {
        CommentAttachment a = mock(CommentAttachment.class);
        lenient().when(a.getOriginalFileName()).thenReturn(name);
        lenient().when(a.getContentType()).thenReturn(mime);
        lenient().when(a.getUrl()).thenReturn(url);
        lenient().when(a.getFileSize()).thenReturn(1024L);
        return a;
    }

    @Test
    @DisplayName("댓글과 스크린샷이 작업 명세에 함께 실린다 — 제목·본문만으로는 절반만 보고 판단하게 된다")
    void handsOverCommentsAndMaterials() {
        properties.setDispatchEnabled(true);
        givenNextQueued(queuedJob("QASA-92"));
        List<Comment> comments = List.of(commentAt("QA", "3층에서만 재현됩니다", 10));
        List<CommentAttachment> materials = List.of(material("bug.png", "image/png", "https://cdn/bug.png"));
        when(commentRepository.findByTaskIdWithAuthor("task-QASA-92")).thenReturn(comments);
        when(commentAttachmentRepository.findByTaskId("task-QASA-92")).thenReturn(materials);

        JiraAutofixResponse.RunnerJob handed = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null).getJob();

        assertThat(handed.getComments()).hasSize(1);
        assertThat(handed.getComments().get(0).getAuthor()).isEqualTo("QA");
        assertThat(handed.getComments().get(0).getBody()).isEqualTo("3층에서만 재현됩니다");
        assertThat(handed.getMaterials()).hasSize(1);
        assertThat(handed.getMaterials().get(0).getUrl()).isEqualTo("https://cdn/bug.png");
        assertThat(handed.getMaterials().get(0).getMimeType()).isEqualTo("image/png");
    }

    @Test
    @DisplayName("댓글은 오래된 순으로 나가고, 상한을 넘으면 최신 쪽을 남긴다 — 재현 절차는 순서가 의미다")
    void ordersCommentsOldestFirstAndKeepsLatestWhenCapped() {
        properties.setDispatchEnabled(true);
        properties.setMaxJobComments(2);
        givenNextQueued(queuedJob("QASA-92"));
        // 일부러 뒤섞어 넣는다 — 저장소 반환 순서에 기대지 않는다는 것을 보이기 위해
        List<Comment> shuffled = List.of(
                commentAt("C", "셋째", 30),
                commentAt("A", "첫째", 10),
                commentAt("B", "둘째", 20));
        when(commentRepository.findByTaskIdWithAuthor("task-QASA-92")).thenReturn(shuffled);

        JiraAutofixResponse.RunnerJob handed = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null).getJob();

        assertThat(handed.getComments()).extracting(c -> c.getBody())
                .containsExactly("둘째", "셋째");
    }

    @Test
    @DisplayName("URL 없는 첨부는 넘기지 않는다 — 러너가 받을 수 없는 항목은 목록만 늘린다")
    void skipsMaterialsWithoutUrl() {
        properties.setDispatchEnabled(true);
        givenNextQueued(queuedJob("QASA-92"));
        List<CommentAttachment> mixed = List.of(
                material("ok.png", "image/png", "https://cdn/ok.png"),
                material("broken.png", "image/png", null),
                material("blank.png", "image/png", "  "));
        when(commentAttachmentRepository.findByTaskId("task-QASA-92")).thenReturn(mixed);

        JiraAutofixResponse.RunnerJob handed = service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null).getJob();

        assertThat(handed.getMaterials()).extracting(m -> m.getFilename()).containsExactly("ok.png");
    }

    // ── 계약 불일치 알림 ────────────────────────────

    private JiraIntegrationConfig driftedRunnerConfig(Integer runnerContract) {
        JiraIntegrationConfig config = JiraIntegrationConfig.builder().board(board).build();
        config.touchAutofixRunner("mac-01", null, runnerContract);
        when(configRepository.findRunnersOnContractDrift(any(), anyInt()))
                .thenReturn(List.of(config));
        return config;
    }

    @Test
    @DisplayName("살아 있는데 계약이 어긋나면 알린다 — 무응답 알림은 이 고장을 영원히 잡지 못한다")
    void alertsWhenLiveRunnerDriftsFromContract() {
        JiraIntegrationConfig config = driftedRunnerConfig(AutofixRunnerContract.VERSION - 1);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(4L);

        assertThat(service.alertContractDrift()).isEqualTo(1);

        verify(slackPublisher).publishContractDrift(eq(board), eq("mac-01"),
                eq(AutofixRunnerContract.VERSION - 1), eq(AutofixRunnerContract.VERSION), eq(4), any());
        assertThat(config.getAutofixContractAlertedAt()).isNotNull();
    }

    @Test
    @DisplayName("계약 버전을 아예 안 보내는 구버전 러너도 같은 고장이다")
    void alertsWhenRunnerSendsNoContractVersion() {
        driftedRunnerConfig(null);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(1L);

        assertThat(service.alertContractDrift()).isEqualTo(1);
    }

    @Test
    @DisplayName("시킬 일이 없으면 알리지 않는다 — 스크립트가 낡은 것만으로는 아직 손해가 없다")
    void doesNotAlertContractDriftWhenQueueEmpty() {
        driftedRunnerConfig(1);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(0L);

        assertThat(service.alertContractDrift()).isZero();
        verifyNoInteractions(slackPublisher);
    }

    @Test
    @DisplayName("한 번 알리면 표식이 남아 5분마다 반복되지 않는다 — 러너가 살아 있어 seenAt은 계속 앞서 나간다")
    void alertsOncePerDriftEpisode() {
        JiraIntegrationConfig config = driftedRunnerConfig(1);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(2L);
        service.alertContractDrift();
        assertThat(config.getAutofixContractAlertedAt()).isNotNull();

        // 두 번째 주기: 표식이 남은 행은 조회 자체에서 빠진다(alertedAt IS NULL 조건)
        when(configRepository.findRunnersOnContractDrift(any(), anyInt())).thenReturn(List.of());

        assertThat(service.alertContractDrift()).isZero();
        verify(slackPublisher, times(1)).publishContractDrift(any(), any(), any(), anyInt(), anyInt(), any());
    }

    @Test
    @DisplayName("계약이 맞는 러너가 붙으면 표식이 풀려 다음 드리프트에 다시 울린다")
    void rearmsWhenContractMatchesAgain() {
        JiraIntegrationConfig config = driftedRunnerConfig(1);
        when(jobRepository.countQueued(BOARD_ID)).thenReturn(2L);
        service.alertContractDrift();
        assertThat(config.getAutofixContractAlertedAt()).isNotNull();

        // 스크립트를 갱신해 올바른 버전으로 붙어 왔다
        config.touchAutofixRunner("mac-01", null, AutofixRunnerContract.VERSION);

        assertThat(config.getAutofixContractAlertedAt()).isNull();
    }

    // ── 맡길 때 올린 자료 ───────────────────────────

    private JiraAutofixRequest.Delegate delegateWithFiles(String instruction, List<String> itemIds,
                                                          List<String> fileKeys) {
        JiraAutofixRequest.Delegate request = delegateRequest(instruction, itemIds);
        request.setFileKeys(fileKeys);
        return request;
    }

    private void givenUploadedFile(String tempKey, String mime, long size) {
        when(fileUploadService.tempFileExists(tempKey)).thenReturn(true);
        lenient().when(fileUploadService.probeObjectSize(tempKey)).thenReturn(size);
        lenient().when(fileUploadService.moveToPermanent(tempKey, BOARD_ID, TASK_ID))
                .thenReturn(new FileUploadService.PermanentResult(
                        "perm/" + tempKey, "https://cdn/" + tempKey, null, "", mime, size));
    }

    @Test
    @DisplayName("올린 자료는 만들어진 job 전부에 붙고, 파일은 한 번만 옮긴다 — 항목마다 복사하면 용량만 N배가 된다")
    void attachesUploadedMaterialsToEveryJob() {
        givenRepo("develop");
        givenDelegatableTask();
        List<ChecklistItem> items = List.of(
                givenItem("item-1", "빈 이름일 때 저장 버튼 비활성화"),
                givenItem("item-2", "중복 이름 검사 추가"));
        when(checklistItemRepository.findByTaskIdOrderByPositionAsc(TASK_ID)).thenReturn(items);
        givenUploadedFile("temp/shot.png", "image/png", 1024L);

        service.delegate(BOARD_ID, USER_ID, delegateWithFiles(
                "이 화면을 보고 고쳐라", List.of("item-1", "item-2"), List.of("temp/shot.png")));

        verify(fileUploadService, times(1)).moveToPermanent(any(), any(), any());
        ArgumentCaptor<List<JiraAutofixJobMaterial>> saved = ArgumentCaptor.forClass(List.class);
        verify(jobMaterialRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).hasSize(2)
                .allSatisfy(m -> assertThat(m.getUrl()).isEqualTo("https://cdn/temp/shot.png"));
        assertThat(saved.getValue()).extracting(JiraAutofixJobMaterial::getJobId).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("첨부 개수 상한을 넘기면 한 건도 옮기지 않는다 — 옮긴 뒤에 막으면 주인 없는 객체가 남는다")
    void rejectsTooManyMaterials() {
        givenRepo("develop");
        givenDelegatableTask();

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID,
                delegateWithFiles("고쳐라", List.of(), List.of("a.png", "b.png", "c.png", "d.png"))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_TOO_MANY_MATERIALS);

        verify(fileUploadService, never()).moveToPermanent(any(), any(), any());
    }

    @Test
    @DisplayName("용량 상한을 넘는 파일은 복사 전에 막는다 — 영상은 복사 자체가 비싸다")
    void rejectsOversizedMaterialBeforeCopy() {
        givenRepo("develop");
        givenDelegatableTask();
        when(fileUploadService.tempFileExists("temp/big.mp4")).thenReturn(true);
        when(fileUploadService.probeObjectSize("temp/big.mp4")).thenReturn(11L * 1024 * 1024);

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID,
                delegateWithFiles("고쳐라", List.of(), List.of("temp/big.mp4"))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_MATERIAL_TOO_LARGE);

        verify(fileUploadService, never()).moveToPermanent(any(), any(), any());
    }

    @Test
    @DisplayName("이미지·영상이 아니면 붙이지 않는다 — 러너가 조용히 버리면 사람은 첨부가 나갔다고 믿는다")
    void rejectsNonMediaMaterial() {
        givenRepo("develop");
        givenDelegatableTask();
        givenUploadedFile("temp/spec.pdf", "application/pdf", 1024L);

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID,
                delegateWithFiles("고쳐라", List.of(), List.of("temp/spec.pdf"))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_MATERIAL_NOT_MEDIA);

        verify(fileUploadService).delete("perm/temp/spec.pdf");
    }

    @Test
    @DisplayName("뒤엣 파일이 실패하면 이미 옮긴 것을 지운다 — 롤백은 S3까지 되돌려 주지 않는다")
    void deletesMovedFilesWhenLaterOneFails() {
        givenRepo("develop");
        givenDelegatableTask();
        givenUploadedFile("temp/ok.png", "image/png", 1024L);
        when(fileUploadService.tempFileExists("temp/gone.png")).thenReturn(false);

        assertThatThrownBy(() -> service.delegate(BOARD_ID, USER_ID,
                delegateWithFiles("고쳐라", List.of(), List.of("temp/ok.png", "temp/gone.png"))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.TEMP_FILE_NOT_FOUND);

        verify(fileUploadService).delete("perm/temp/ok.png");
        verify(jobMaterialRepository, never()).saveAll(anyList());
    }

    // ── 다시 담기 ─────────────────────────────────
    //
    // "이슈당 1회"는 중복 PR을 막으려는 가드이지 영구 배제가 아니다. 사람이 한 건을 지목해
    // 다시 돌리는 경로가 여기다 — 목록에서 무더기로 담는 경로와 달리 판정을 다시 묻지 않는다.

    @Test
    @DisplayName("PR까지 간 작업을 같은 대상으로 다시 담는다")
    void requeuesSucceededJob() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-30");

        JiraAutofixResponse.JobItem item = service.requeueJob(BOARD_ID, USER_ID, source.getId());

        JiraAutofixJob requeued = capturedRequeued();
        assertThat(requeued.getStatus()).isEqualTo(AutofixJobStatus.QUEUED);
        assertThat(requeued.getJobKey()).isEqualTo("QASA-30");
        assertThat(requeued.getTaskId()).isEqualTo("task-QASA-30");
        assertThat(requeued.getRepoFullName()).isEqualTo(REPO);
        assertThat(item.getStatus()).isEqualTo("QUEUED");
        // 다시 담은 사람이 감사 대상이다 — 원본 JIRA 건에는 작성자가 없다
        assertThat(requeued.getCreatedBy()).isEqualTo(USER_ID);
    }

    @Test
    @DisplayName("원본은 상태를 그대로 둔 채 대체됨으로만 표시한다 — 이전 PR 주소가 화면에 남아야 한다")
    void marksSourceSupersededWithoutTouchingResult() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-31");

        service.requeueJob(BOARD_ID, USER_ID, source.getId());

        assertThat(source.getSupersededAt()).isNotNull();
        assertThat(source.getStatus()).isEqualTo(AutofixJobStatus.SUCCEEDED);
        assertThat(source.getPrUrl()).isEqualTo("https://github.com/o/r/pull/7");
    }

    @Test
    @DisplayName("브랜치는 새로 만든다 — 이전 브랜치를 그대로 쓰면 push가 non-fast-forward로 막힌다")
    void givesRequeuedJobItsOwnBranch() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-32");

        service.requeueJob(BOARD_ID, USER_ID, source.getId());

        assertThat(capturedRequeued().getBranchName())
                .startsWith("autofix/QASA-32-")
                .isNotEqualTo(source.getBranchName());
    }

    @Test
    @DisplayName("올렸던 자료는 새 작업에도 붙는다 — 그림 없이 나간 지시문은 엉뚱한 것을 고치게 한다")
    void copiesMaterialsToRequeuedJob() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-33");
        when(jobMaterialRepository.findByJobIdOrderByCreatedAtAsc(source.getId()))
                .thenReturn(List.of(JiraAutofixJobMaterial.of(source.getId(), "shot.png",
                        "perm/shot.png", "https://cdn/shot.png", "image/png", 2048L)));

        service.requeueJob(BOARD_ID, USER_ID, source.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<JiraAutofixJobMaterial>> captor = ArgumentCaptor.forClass(List.class);
        verify(jobMaterialRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).singleElement()
                .satisfies(m -> {
                    // S3 객체는 복사하지 않는다 — 같은 파일을 두 행이 가리킨다
                    assertThat(m.getS3Key()).isEqualTo("perm/shot.png");
                    assertThat(m.getJobId()).isEqualTo(capturedRequeued().getId());
                });
    }

    @Test
    @DisplayName("아직 끝나지 않은 작업은 다시 담지 않는다 — 같은 대상이 동시에 둘 돈다")
    void refusesRequeueOfUnfinishedJob() {
        JiraAutofixJob queued = queuedJob("QASA-34");
        when(jobRepository.findById(queued.getId())).thenReturn(Optional.of(queued));

        assertThatThrownBy(() -> service.requeueJob(BOARD_ID, USER_ID, queued.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_REQUEUABLE);
    }

    @Test
    @DisplayName("한 번 대체된 시도는 다시 담을 수 없다 — 같은 원본으로 두 건이 만들어진다")
    void refusesSecondRequeueOfSameSource() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-35");
        service.requeueJob(BOARD_ID, USER_ID, source.getId());

        assertThatThrownBy(() -> service.requeueJob(BOARD_ID, USER_ID, source.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_JOB_NOT_REQUEUABLE);
    }

    @Test
    @DisplayName("같은 이슈로 도는 작업이 이미 있으면 다시 담지 않는다")
    void refusesRequeueWhenAnotherJobIsActiveForIssue() {
        givenRepo("develop");
        JiraAutofixJob source = succeededJob("QASA-36");
        when(jobRepository.existsActiveForIssue(BOARD_ID, "QASA-36")).thenReturn(true);

        assertThatThrownBy(() -> service.requeueJob(BOARD_ID, USER_ID, source.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_ALREADY_DELEGATED);
        verify(jobRepository, never()).save(any(JiraAutofixJob.class));
    }

    @Test
    @DisplayName("검증 클론이 없다고 러너가 보고했으면 다시 담지 않는다 — 위임과 같은 판단이다")
    void refusesRequeueWhenRunnerVerifyNotReady() {
        JiraAutofixJob source = succeededJob("QASA-37");
        JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
        when(config.getAutofixRunnerStatus()).thenReturn("{\"verify_ready\":false}");
        when(configRepository.findByBoardId(BOARD_ID)).thenReturn(Optional.of(config));

        assertThatThrownBy(() -> service.requeueJob(BOARD_ID, USER_ID, source.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_RUNNER_NOT_READY);
        assertThat(source.getSupersededAt()).isNull();
    }

    @Test
    @DisplayName("맡긴 작업은 지시문을 그대로 옮긴다 — 다시 담기는 새 위임이 아니라 같은 일 한 번 더다")
    void carriesInstructionOnManualRequeue() {
        givenRepo("develop");
        JiraAutofixJob source = JiraAutofixJob.forManualTask(board, "task-9", "저장 버튼을 고쳐라", "user-9");
        source.assignTarget("inst-1", REPO, "develop");
        source.markClaimed("mac-01");
        source.complete(AutofixJobStatus.FAILED, null, "컴파일 실패", null);
        when(jobRepository.findById(source.getId())).thenReturn(Optional.of(source));

        service.requeueJob(BOARD_ID, USER_ID, source.getId());

        JiraAutofixJob requeued = capturedRequeued();
        assertThat(requeued.getInstruction()).isEqualTo("저장 버튼을 고쳐라");
        assertThat(requeued.getJobKind()).isEqualTo(AutofixJobKind.MANUAL);
        assertThat(requeued.getJobKey()).isEqualTo(source.getJobKey());
    }

    @Test
    @DisplayName("맡긴 대상이 이미 큐에 있으면 다시 담지 않는다")
    void refusesManualRequeueWhilePendingForSameTask() {
        JiraAutofixJob source = JiraAutofixJob.forManualTask(board, "task-9", "고쳐라", "user-9");
        source.markClaimed("mac-01");
        source.complete(AutofixJobStatus.FAILED, null, "컴파일 실패", null);
        when(jobRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(jobRepository.existsPendingForTask(BOARD_ID, "task-9")).thenReturn(true);

        assertThatThrownBy(() -> service.requeueJob(BOARD_ID, USER_ID, source.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JIRA_AUTOFIX_ALREADY_DELEGATED);
    }

    @Test
    @DisplayName("맡길 때 올린 자료가 댓글 첨부보다 앞에 나간다 — 러너는 상한을 넘긴 뒤쪽을 버린다")
    void putsDelegatedMaterialsBeforeCommentAttachments() {
        properties.setDispatchEnabled(true);
        JiraAutofixJob job = queuedJob("QASA-92");
        givenNextQueued(job);
        // 중첩 stubbing이 되지 않게 첨부를 먼저 만들어 둔다
        CommentAttachment fromComment = material("old.png", "image/png", "https://cdn/old.png");
        when(jobMaterialRepository.findByJobIdOrderByCreatedAtAsc(job.getId()))
                .thenReturn(List.of(JiraAutofixJobMaterial.of(job.getId(), "shot.png",
                        "perm/shot.png", "https://cdn/shot.png", "image/png", 2048L)));
        when(commentAttachmentRepository.findByTaskId("task-QASA-92"))
                .thenReturn(List.of(fromComment));

        JiraAutofixResponse.RunnerJob handed =
                service.claim(BOARD_ID, "mac-01", AutofixRunnerContract.VERSION, null).getJob();

        assertThat(handed.getMaterials()).extracting(m -> m.getFilename())
                .containsExactly("shot.png", "old.png");
    }
}
