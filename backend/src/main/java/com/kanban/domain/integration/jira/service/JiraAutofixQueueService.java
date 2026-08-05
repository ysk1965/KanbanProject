package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

/**
 * 자동수정 작업 큐 — 트리아지 후보를 담고, 러너가 가져가게 하고, 콜백을 받아 마무리한다.
 *
 * <p><b>작업은 밀어 넣지 않고 러너가 가져간다(pull).</b> 실행 주체는 Unity Editor가 떠 있는 맥
 * 한 대뿐이고, 그 맥이 언제 여유가 있는지는 맥만 안다. 서버가 그것을 추측해 밀어 넣으면 이미 돌고
 * 있는데 또 보내는 사고가 나고, 그걸 막으려고 서버·러너 양쪽에 큐를 두면 두 큐가 어긋난다.
 *
 * <p><b>직렬 보장이 이 클래스의 핵심 책임이다.</b> Unity Editor는 프로젝트당 인스턴스가 하나뿐이므로
 * in-flight 작업이 있으면 claim에 아무것도 내주지 않는다 — 러너가 실수로 두 번 물어도 마찬가지다.
 *
 * <p>가드레일 네 가지 — confidence 임계값 / 이슈당 1회 / 일일 상한 / 항상 PR까지만.
 * 마지막 하나는 러너 스크립트가 지킨다(머지 단계가 아예 없다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraAutofixQueueService {

    private final AutofixProperties properties;
    private final ObjectMapper objectMapper;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final JiraAutofixTriageRepository triageRepository;
    private final JiraAutofixJobRepository jobRepository;
    private final JiraIntegrationConfigRepository configRepository;
    private final TaskRepository taskRepository;
    private final BoardGithubRepoRepository boardGithubRepoRepository;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraAutofixSlackPublisher slackPublisher;

    /** 러너가 보낸 로그 꼬리 상한. 실패 원인을 보기엔 충분하고, 행이 비대해지진 않는 크기. */
    private static final int MAX_LOG_EXCERPT = 8000;

    // ── 큐에 담기 ──────────────────────────────────

    /**
     * 트리아지 CANDIDATE를 confidence 높은 순으로 큐에 담는다.
     *
     * <p>이미 작업이 있는 이슈는 건너뛴다 — 같은 이슈로 PR이 두 개 열리면 리뷰어가 혼란스럽다.
     *
     * @param limit     null이면 후보 전부(설정 상한까지)
     * @param issueKeys 지정하면 그중에서만 고른다. 사람이 목록에서 골라 담는 경로.
     *                  confidence 임계값은 여기서도 그대로 적용된다 — 화면에서 고른 것이
     *                  가드레일을 우회하는 통로가 되면 안 된다.
     */
    @Transactional
    public JiraAutofixResponse.EnqueueResult enqueueCandidates(String boardId, String userId,
                                                               Integer limit, List<String> issueKeys) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        DispatchTarget target = resolveTarget(boardId);

        int cap = Math.min(limit != null ? limit : properties.getMaxEnqueuePerRequest(),
                properties.getMaxEnqueuePerRequest());

        List<JiraAutofixTriage> candidates =
                triageRepository.findByBoardIdAndVerdict(boardId, AutofixVerdict.CANDIDATE);

        if (issueKeys != null && !issueKeys.isEmpty()) {
            Set<String> wanted = new HashSet<>(issueKeys);
            candidates = candidates.stream()
                    .filter(t -> wanted.contains(t.getJiraIssueKey()))
                    .toList();
        }

        int queued = 0;
        int skippedLowConfidence = 0;
        int skippedAlreadyQueued = 0;
        List<JiraAutofixJob> toSave = new ArrayList<>();

        for (JiraAutofixTriage triage : candidates) {
            if (queued >= cap) break;

            double confidence = triage.getConfidence() != null ? triage.getConfidence() : 0.0;
            if (confidence < properties.getMinConfidence()) {
                skippedLowConfidence++;
                continue;
            }
            if (jobRepository.existsActiveForIssue(boardId, triage.getJiraIssueKey())) {
                skippedAlreadyQueued++;
                continue;
            }

            JiraAutofixJob job = JiraAutofixJob.builder()
                    .board(board)
                    .jiraIssueKey(triage.getJiraIssueKey())
                    .taskId(triage.getTaskId())
                    .confidence(confidence)
                    .status(AutofixJobStatus.QUEUED)
                    .build();
            job.assignTarget(target.installationId(), target.repoFullName(), target.baseRef());
            toSave.add(job);
            queued++;
        }

        jobRepository.saveAll(toSave);
        log.info("Autofix enqueue: board={} queued={} lowConfidence={} alreadyQueued={}",
                boardId, queued, skippedLowConfidence, skippedAlreadyQueued);

        return JiraAutofixResponse.EnqueueResult.builder()
                .queued(queued)
                .skippedLowConfidence(skippedLowConfidence)
                .skippedAlreadyQueued(skippedAlreadyQueued)
                .repoFullName(target.repoFullName())
                .baseRef(target.baseRef())
                .build();
    }

    // ── claim (러너가 가져간다) ──────────────────────

    /**
     * 러너에게 다음 한 건을 내준다. 내줄 게 없으면 이유를 담아 빈 결과를 돌려준다 —
     * 러너 로그에 "왜 조용한지"가 남아야 맥 앞에 앉지 않고도 원인을 안다.
     *
     * <p>말을 걸어온 사실 자체를 기록한다(내줄 게 없어도). 이 값이 화면의 "러너 연결됨" 근거다.
     */
    @Transactional
    public JiraAutofixResponse.ClaimResult claim(String boardId, String runnerName,
                                                 JiraAutofixRequest.RunnerStatus status) {
        touchRunner(boardId, runnerName, status);

        if (!properties.isDispatchEnabled()) {
            return JiraAutofixResponse.ClaimResult.of(null, "DISPATCH_DISABLED");
        }
        if (jobRepository.countInFlight(boardId) > 0) {
            // 러너가 이전 건을 회신하지 않은 채 다시 물었다. 두 건이 동시에 도는 것보다 조용한 편이 낫다.
            return JiraAutofixResponse.ClaimResult.of(null, "IN_FLIGHT");
        }

        LocalDateTime dayAgo = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        if (jobRepository.countDispatchedSince(boardId, dayAgo) >= properties.getDailyLimit()) {
            return JiraAutofixResponse.ClaimResult.of(null, "DAILY_LIMIT");
        }

        List<JiraAutofixJob> next = jobRepository.findByBoardIdAndStatus(
                boardId, AutofixJobStatus.QUEUED, PageRequest.of(0, 1));
        if (next.isEmpty()) {
            return JiraAutofixResponse.ClaimResult.of(null, "EMPTY");
        }

        JiraAutofixJob job = next.get(0);
        if (job.getRepoFullName() == null || job.getRepoFullName().isBlank()) {
            // 큐에 담길 때 대상이 없었던 건. 내주면 러너가 어디서 고칠지 모른다.
            job.complete(AutofixJobStatus.FAILED, null, "대상 저장소가 지정되지 않았습니다", null);
            return JiraAutofixResponse.ClaimResult.of(null, "NO_TARGET");
        }

        job.markClaimed(runnerName);
        log.info("Autofix claimed: board={} issue={} repo={} runner={}",
                boardId, job.getJiraIssueKey(), job.getRepoFullName(), runnerName);
        return JiraAutofixResponse.ClaimResult.of(buildRunnerJob(job), "CLAIMED");
    }

    /** 러너가 살아 있다는 신호만 받는다 — 긴 작업 중에는 claim을 부르지 않기 때문이다. */
    @Transactional
    public void heartbeat(String boardId, String runnerName, JiraAutofixRequest.RunnerStatus status) {
        touchRunner(boardId, runnerName, status);
    }

    /**
     * 러너 생존·자가진단 반영.
     *
     * <p>러너가 보낸 값을 그대로 저장하지 않고 서버가 아는 필드만 뽑아 다시 직렬화한다 —
     * 이 엔드포인트는 보드 토큰만으로 열려 있어서, 임의의 문자열이 DB에 들어가는 통로가 되면 안 된다.
     */
    private void touchRunner(String boardId, String runnerName, JiraAutofixRequest.RunnerStatus status) {
        String statusJson = null;
        if (status != null) {
            try {
                statusJson = objectMapper.writeValueAsString(status);
            } catch (Exception e) {
                log.debug("Autofix: 러너 상태 직렬화 실패 board={}: {}", boardId, e.getMessage());
            }
        }
        String json = statusJson;
        configRepository.findByBoardId(boardId)
                .ifPresent(config -> config.touchAutofixRunner(runnerName, json));
    }

    /**
     * 러너가 받아갈 작업 명세.
     *
     * <p>이슈 본문은 JIRA를 다시 부르지 않고 가져온 Task에서 읽는다 — import 시점에 이미 평문으로
     * 변환해 저장해 뒀고, 매번 JIRA를 때리면 레이트 리밋만 소모한다.
     *
     * <p>브랜치 이름은 서버가 정한다. 러너가 정하면 재실행·수동 실행마다 규칙이 흔들린다.
     */
    private JiraAutofixResponse.RunnerJob buildRunnerJob(JiraAutofixJob job) {
        String title = job.getJiraIssueKey();
        String body = "";

        if (job.getTaskId() != null) {
            Task task = taskRepository.findById(job.getTaskId()).orElse(null);
            if (task != null) {
                title = task.getTitle() != null ? task.getTitle() : title;
                body = nullToEmpty(task.getDescription());
            }
        }

        String verification = triageRepository
                .findByBoardIdAndJiraIssueKey(job.getBoard().getId(), job.getJiraIssueKey())
                .map(JiraAutofixTriage::getVerification)
                .orElse("");

        String testInfra = configRepository.findByBoardId(job.getBoard().getId())
                .map(JiraIntegrationConfig::resolveAutofixTestInfra)
                .orElse(TestInfraLevel.NONE)
                .name();

        return JiraAutofixResponse.RunnerJob.builder()
                .jobId(job.getId())
                .jiraIssueKey(job.getJiraIssueKey())
                .issueTitle(clip(title, 200))
                .issueBody(clip(body, 8000))
                .verification(clip(verification, 500))
                .testInfra(testInfra)
                .repoFullName(job.getRepoFullName())
                .baseRef(nullToEmpty(job.getBaseRef()))
                .branch("autofix/" + job.getJiraIssueKey())
                .timeoutMinutes(Math.min(properties.getRunnerTimeoutMinutes(),
                        properties.getDispatchTimeoutMinutes()))
                .build();
    }

    // ── 콜백 ──────────────────────────────────────

    /** 러너 콜백 토큰 검증. JIRA 웹훅 토큰과 별개다 — 하나를 회전해도 다른 쪽이 죽지 않아야 한다. */
    @Transactional(readOnly = true)
    public boolean verifyCallbackToken(String boardId, String token) {
        if (token == null || token.isBlank()) return false;
        return configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::getAutofixCallbackToken)
                .filter(saved -> saved != null && !saved.isBlank())
                .map(saved -> constantTimeEquals(saved, token))
                .orElse(false);
    }

    /**
     * 러너 결과 반영. 종료 상태로 넘긴 뒤 JIRA에 결과 댓글을 단다.
     *
     * <p>페이로드는 {@code job_id}로 매칭한다. 이슈키 매칭도 남겨 두는 이유는 사람이 손으로 한 건을
     * 돌려볼 때(단건 스크립트) job_id 없이 회신할 수 있어야 하기 때문이다.
     *
     * <p>콜백은 재전송될 수 있으므로 멱등하게 처리한다 — 이미 종료된 작업이면 조용히 무시한다.
     */
    @Transactional
    public void handleCallback(String boardId, JsonNode payload) {
        JiraAutofixJob job = findCallbackTarget(boardId, payload);
        if (job == null) return;

        String prUrl = blankToNull(text(payload, "pr_url"));
        AutofixJobStatus result = resolveResult(text(payload, "result"), prUrl);
        String failureReason = result == AutofixJobStatus.FAILED
                ? clip(defaultIfBlank(text(payload, "failure_reason"), "러너가 실패를 보고했습니다"), 1000)
                : null;

        boolean applied = job.complete(result, prUrl, failureReason,
                blankToNull(clip(text(payload, "log_excerpt"), MAX_LOG_EXCERPT)));
        if (!applied) return;

        log.info("Autofix result: board={} issue={} result={} pr={}",
                boardId, job.getJiraIssueKey(), result, prUrl);
        postJiraComment(boardId, job, result);
        notifySlack(job);
    }

    /** 진행 중인 작업만 찾는다. 없으면 타임아웃 회수됐거나 중복 콜백이다 — 오류가 아니다. */
    private JiraAutofixJob findCallbackTarget(String boardId, JsonNode payload) {
        String jobId = blankToNull(text(payload, "job_id"));
        String issueKey = blankToNull(text(payload, "issue_key"));

        JiraAutofixJob job = jobId != null
                ? jobRepository.findById(jobId)
                        .filter(j -> j.getBoard().getId().equals(boardId))
                        .filter(j -> j.getStatus() == AutofixJobStatus.DISPATCHED)
                        .orElse(null)
                : issueKey != null
                        ? jobRepository.findDispatchedByIssueKey(boardId, issueKey).orElse(null)
                        : null;

        if (job == null) {
            log.info("Autofix callback for unknown/settled job: board={} job={} issue={}",
                    boardId, jobId, issueKey);
        }
        return job;
    }

    /**
     * 러너가 보고한 결과를 상태로 옮긴다. {@code result}는 pr / no_change / failed 셋뿐이다.
     * 러너가 pr이라고 해도 URL이 없으면 SUCCEEDED로 치지 않는다 — PR이 산출물이다.
     */
    private AutofixJobStatus resolveResult(String result, String prUrl) {
        if ("no_change".equalsIgnoreCase(result)) return AutofixJobStatus.NO_CHANGE;
        if ("pr".equalsIgnoreCase(result) && prUrl != null) return AutofixJobStatus.SUCCEEDED;
        return AutofixJobStatus.FAILED;
    }

    /** JIRA 이슈에 결과를 남긴다. 실패해도 작업 상태는 이미 확정됐으므로 예외를 삼킨다. */
    private void postJiraComment(String boardId, JiraAutofixJob job, AutofixJobStatus result) {
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId).orElse(null);
        if (config == null) return;

        String message = switch (result) {
            case SUCCEEDED -> "BRIDGE 자동수정이 PR을 생성했습니다: " + job.getPrUrl()
                    + "\n자동 검증은 컴파일 통과까지만입니다. 머지 전 검토가 필요합니다.";
            case NO_CHANGE -> "BRIDGE 자동수정이 이 이슈를 자동으로 고칠 수 없다고 판단했습니다.";
            default -> "BRIDGE 자동수정이 실패했습니다."
                    + (job.getFailureReason() != null ? " 사유: " + job.getFailureReason() : "");
        };

        try {
            String token = oauthService.resolveToken(config);
            jiraApiClient.addComment(JiraAuthContext.of(config, token), job.getJiraIssueKey(),
                    JiraAdfConverter.toAdf(objectMapper, message));
        } catch (Exception e) {
            log.warn("Autofix: JIRA 결과 댓글 실패 issue={}: {}", job.getJiraIssueKey(), e.getMessage());
        }
    }

    /**
     * 결과를 슬랙 채널에도 남긴다. JIRA 댓글은 그 이슈를 보는 사람에게만 닿지만, PR은 리뷰어가
     * 있어야 진행되고 실패는 러너를 손봐야 풀린다 — 팀이 보는 곳에 한 번 더 남긴다.
     *
     * <p>이슈 제목과 JIRA 주소는 여기서 값으로 뽑아 넘긴다. 게시 쪽이 지연 로딩 엔티티를 만지지
     * 않아야 나중에 비동기로 빼도 그대로 동작한다.
     */
    private void notifySlack(JiraAutofixJob job) {
        if (!properties.isSlackNotifyEnabled()) return;

        String boardId = job.getBoard().getId();
        String title = job.getTaskId() != null
                ? taskRepository.findById(job.getTaskId()).map(Task::getTitle).orElse(null)
                : null;
        String jiraBaseUrl = configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::getBaseUrl)
                .orElse(null);

        slackPublisher.publish(job.getBoard(), job, title, jiraBaseUrl);
    }

    // ── 회수 ──────────────────────────────────────

    /**
     * 회신이 끝내 오지 않은 작업을 회수한다. 맥이 죽거나 잠들거나 네트워크가 끊기면 발생하며,
     * 이게 없으면 DISPATCHED 하나가 그 보드의 큐를 영구히 막는다.
     *
     * @return 회수한 건수
     */
    @Transactional
    public int sweepStaleDispatches() {
        LocalDateTime deadline = LocalDateTime.now(ZoneOffset.UTC)
                .minusMinutes(properties.getDispatchTimeoutMinutes());
        List<JiraAutofixJob> stale = jobRepository.findStaleDispatched(deadline);
        for (JiraAutofixJob job : stale) {
            job.markTimedOut();
            // 회수는 아무도 요청하지 않은 종료다 — 알리지 않으면 러너가 죽은 걸 다음 사람이 큐를
            // 열어볼 때까지 모른다.
            notifySlack(job);
        }
        if (!stale.isEmpty()) {
            log.warn("Autofix: {}건이 콜백 없이 타임아웃됐다", stale.size());
        }
        return stale.size();
    }

    // ── 조회 / 취소 ────────────────────────────────

    /**
     * 큐 준비 상태. 셋업이 3단계라 하나만 빠져도 큐가 조용히 멈춘 것처럼 보이므로,
     * 무엇이 빠졌는지 화면이 스스로 설명할 수 있게 전부 내려준다.
     */
    @Transactional(readOnly = true)
    public JiraAutofixResponse.QueueStatus getQueueStatus(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        String repoFullName = null;
        boolean ambiguous = false;

        List<BoardGithubRepo> repos = boardGithubRepoRepository.findByBoardIdAndActiveTrue(boardId);
        if (repos.size() > 1) {
            ambiguous = true;
        } else if (repos.size() == 1) {
            repoFullName = repos.get(0).getRepoFullName();
        }

        JiraIntegrationConfig config = configRepository.findByBoardId(boardId).orElse(null);
        LocalDateTime runnerSeenAt = config != null ? config.getAutofixRunnerSeenAt() : null;
        boolean runnerOnline = runnerSeenAt != null && runnerSeenAt.isAfter(
                LocalDateTime.now(ZoneOffset.UTC).minusMinutes(properties.getRunnerOnlineWindowMinutes()));

        List<JiraAutofixTriage> candidates =
                triageRepository.findByBoardIdAndVerdict(boardId, AutofixVerdict.CANDIDATE);
        int eligible = (int) candidates.stream()
                .filter(t -> t.getConfidence() != null && t.getConfidence() >= properties.getMinConfidence())
                .filter(t -> !jobRepository.existsActiveForIssue(boardId, t.getJiraIssueKey()))
                .count();

        boolean tokenSet = config != null && config.getAutofixCallbackToken() != null
                && !config.getAutofixCallbackToken().isBlank();

        LocalDateTime dayAgo = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);

        return JiraAutofixResponse.QueueStatus.builder()
                .repoFullName(repoFullName)
                .repoAmbiguous(ambiguous)
                .runnerOnline(runnerOnline)
                .runnerName(config != null ? config.getAutofixRunnerName() : null)
                .runnerSeenAt(toIso(runnerSeenAt))
                .runnerStatus(parseRunnerStatus(config))
                .callbackTokenSet(tokenSet)
                .dispatchEnabled(properties.isDispatchEnabled())
                .inFlight((int) jobRepository.countInFlight(boardId))
                .queued((int) jobRepository.countQueued(boardId))
                .dispatchedToday((int) jobRepository.countDispatchedSince(boardId, dayAgo))
                .dailyLimit(properties.getDailyLimit())
                .minConfidence(properties.getMinConfidence())
                .eligibleCandidates(eligible)
                .totalCandidates(candidates.size())
                .build();
    }

    @Transactional(readOnly = true)
    public List<JiraAutofixResponse.JobItem> getJobs(String boardId, String userId, int limit) {
        boardService.checkMemberOrAbove(boardId, userId);
        return jobRepository.findByBoardId(boardId, PageRequest.of(0, Math.min(limit, 200))).stream()
                .map(this::toItem)
                .toList();
    }

    /**
     * 작업 취소. 기본은 아직 나가지 않은 QUEUED만이다.
     *
     * @param force true면 러너가 물고 있는 DISPATCHED도 강제 회수한다. 러너가 죽어 콜백이 오지
     *              않으면 그 한 건이 타임아웃까지 보드의 큐 전체를 막으므로, 사람이 즉시 풀 수 있는
     *              길을 남긴다. 실제 Actions 실행이 멈추지는 않는다.
     */
    @Transactional
    public void cancelJob(String boardId, String userId, String jobId, boolean force) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraAutofixJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND));
        if (!job.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
        }
        boolean applied = job.cancel() || (force && job.release());
        if (!applied) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
        }
        if (force) {
            log.warn("Autofix job force-released: board={} issue={}", boardId, job.getJiraIssueKey());
        }
    }

    /** 콜백 URL을 조립해 반환. 없으면 생성한다(멱등). */
    @Transactional
    public String ensureCallbackToken(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        return config.ensureAutofixCallbackToken();
    }

    private JiraAutofixResponse.JobItem toItem(JiraAutofixJob job) {
        return JiraAutofixResponse.JobItem.builder()
                .id(job.getId())
                .jiraIssueKey(job.getJiraIssueKey())
                .taskId(job.getTaskId())
                .status(job.getStatus().name())
                .confidence(job.getConfidence())
                .repoFullName(job.getRepoFullName())
                .runnerName(job.getRunnerName())
                .prUrl(job.getPrUrl())
                .failureReason(job.getFailureReason())
                .logExcerpt(job.getLogExcerpt())
                .queuedAt(toIso(job.getQueuedAt()))
                .dispatchedAt(toIso(job.getDispatchedAt()))
                .completedAt(toIso(job.getCompletedAt()))
                .build();
    }

    // ── 내부 ──────────────────────────────────────

    private record DispatchTarget(String installationId, String repoFullName, String baseRef) {}

    /**
     * 보드에 연결된 저장소를 하나로 확정한다. 여러 개면 어디로 PR을 보낼지 알 수 없으므로
     * 추측하지 않고 거부한다 — 잘못된 저장소에 PR을 여는 것보다 낫다.
     */
    private DispatchTarget resolveTarget(String boardId) {
        List<BoardGithubRepo> repos = boardGithubRepoRepository.findByBoardIdAndActiveTrue(boardId);
        if (repos.isEmpty()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_NO_REPO);
        }
        if (repos.size() > 1) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_AMBIGUOUS_REPO);
        }
        BoardGithubRepo repo = repos.get(0);
        String baseRef = (repo.getBranch() != null && !repo.getBranch().isBlank())
                ? repo.getBranch() : properties.getDefaultBaseRef();
        return new DispatchTarget(
                repo.getInstallation().getInstallationId(), repo.getRepoFullName(), baseRef);
    }

    /** 토큰 비교는 길이 정보만 흘리도록 상수 시간으로 한다. */
    private boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

    private static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** 저장해 둔 러너 자가진단을 그대로 내려준다. 깨진 값이면 조용히 null — 화면이 멈출 이유는 아니다. */
    private JsonNode parseRunnerStatus(JiraIntegrationConfig config) {
        if (config == null || config.getAutofixRunnerStatus() == null) return null;
        try {
            return objectMapper.readTree(config.getAutofixRunnerStatus());
        } catch (Exception e) {
            return null;
        }
    }

    private static String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String clip(String value, int limit) {
        if (value == null) return "";
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private static String toIso(LocalDateTime value) {
        return value != null ? value.toString() : null;
    }
}
