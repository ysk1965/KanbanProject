package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.github.service.GithubApiClient;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 자동수정 작업 큐 — 트리아지 후보를 담고, 러너에 한 건씩 내보내고, 콜백을 받아 마무리한다.
 *
 * <p><b>직렬 보장이 이 클래스의 핵심 책임이다.</b> Unity Editor는 프로젝트당 인스턴스가 하나뿐이라
 * 러너 쪽에서도 concurrency group으로 막지만, BRIDGE가 무분별하게 디스패치하면 GitHub Actions 큐에
 * 작업이 쌓이고 어느 것이 어느 이슈인지 추적이 흐려진다. 그래서 in-flight 작업이 있으면 보내지 않는다.
 *
 * <p>가드레일 네 가지 — confidence 임계값 / 이슈당 1회 / 일일 상한 / 항상 PR까지만.
 * 마지막 하나는 러너 워크플로가 지킨다(머지 단계가 아예 없다).
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
    private final GithubApiClient githubApiClient;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;

    /** 러너가 결과를 되돌려보낼 이 서버의 공개 주소. 비어 있으면 콜백을 쓰지 않는다. */
    @Value("${app.backend-url:}")
    private String backendUrl;

    // ── 큐에 담기 ──────────────────────────────────

    /**
     * 트리아지 CANDIDATE를 confidence 높은 순으로 큐에 담는다.
     *
     * <p>이미 작업이 있는 이슈는 건너뛴다 — 같은 이슈로 PR이 두 개 열리면 리뷰어가 혼란스럽다.
     *
     * @param limit null이면 후보 전부(설정 상한까지)
     */
    @Transactional
    public JiraAutofixResponse.EnqueueResult enqueueCandidates(String boardId, String userId, Integer limit) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        DispatchTarget target = resolveTarget(boardId);

        int cap = Math.min(limit != null ? limit : properties.getMaxEnqueuePerRequest(),
                properties.getMaxEnqueuePerRequest());

        List<JiraAutofixTriage> candidates =
                triageRepository.findByBoardIdAndVerdict(boardId, AutofixVerdict.CANDIDATE);

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
            job.assignTarget(target.installationId(), target.repoFullName(),
                    properties.getWorkflowFile(), target.baseRef());
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

    // ── 디스패치 ───────────────────────────────────

    /**
     * 큐에서 다음 한 건을 러너에 넘긴다. 보낼 게 없거나 이미 진행 중이면 아무것도 하지 않는다.
     *
     * <p>워크플로 존재를 먼저 확인한다 — 없는 워크플로를 부르면 404가 나는데, 그걸 작업 실패로
     * 기록하면 큐의 모든 작업이 같은 이유로 하나씩 소진된다.
     *
     * @return 디스패치한 작업, 없으면 empty
     */
    @Transactional
    public Optional<JiraAutofixJob> dispatchNext(String boardId) {
        if (jobRepository.countInFlight(boardId) > 0) {
            return Optional.empty();   // 러너가 물고 있다 — 직렬 보장
        }

        LocalDateTime dayAgo = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        if (jobRepository.countDispatchedSince(boardId, dayAgo) >= properties.getDailyLimit()) {
            log.info("Autofix daily limit reached for board {} ({})", boardId, properties.getDailyLimit());
            return Optional.empty();
        }

        List<JiraAutofixJob> next = jobRepository.findByBoardIdAndStatus(
                boardId, AutofixJobStatus.QUEUED, PageRequest.of(0, 1));
        if (next.isEmpty()) return Optional.empty();

        JiraAutofixJob job = next.get(0);

        if (job.getInstallationId() == null || job.getRepoFullName() == null) {
            job.complete(AutofixJobStatus.FAILED, null, null, "디스패치 대상 저장소가 지정되지 않았습니다");
            return Optional.empty();
        }

        if (!githubApiClient.hasWorkflow(job.getInstallationId(), job.getRepoFullName(), job.getWorkflowFile())) {
            // 큐를 갉아먹지 않도록 이 작업은 QUEUED로 남기고 디스패치만 포기한다
            log.warn("Autofix: workflow {} not found on {} — 기본 브랜치에 올렸는지 확인 필요",
                    job.getWorkflowFile(), job.getRepoFullName());
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_WORKFLOW_NOT_FOUND);
        }

        String callbackUrl = buildCallbackUrl(boardId);
        githubApiClient.dispatchWorkflow(
                job.getInstallationId(), job.getRepoFullName(), job.getWorkflowFile(), job.getBaseRef(),
                buildInputs(job, callbackUrl));

        job.markDispatched();
        log.info("Autofix dispatched: board={} issue={} repo={}",
                boardId, job.getJiraIssueKey(), job.getRepoFullName());
        return Optional.of(job);
    }

    /**
     * 러너에 넘길 workflow_dispatch inputs.
     *
     * <p>이슈 본문은 JIRA를 다시 부르지 않고 가져온 Task에서 읽는다 — import 시점에 이미 평문으로
     * 변환해 저장해 뒀고, 디스패치마다 JIRA를 때리면 레이트 리밋만 소모한다.
     */
    private Map<String, String> buildInputs(JiraAutofixJob job, String callbackUrl) {
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

        return Map.of(
                "issue_key", job.getJiraIssueKey(),
                "issue_title", clip(title, 200),
                "issue_body", clip(body, 4000),
                "verification", clip(verification, 500),
                "base_ref", nullToEmpty(job.getBaseRef()),
                "callback_url", nullToEmpty(callbackUrl));
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
     * 러너 결과 반영. 이슈키로 DISPATCHED 작업을 찾아 종료 상태로 넘기고, JIRA에 결과 댓글을 단다.
     *
     * <p>콜백은 재전송될 수 있으므로 멱등하게 처리한다 — 이미 종료된 작업이면 조용히 무시한다.
     */
    @Transactional
    public void handleCallback(String boardId, JsonNode payload) {
        String issueKey = text(payload, "issue_key");
        if (issueKey == null || issueKey.isBlank()) {
            log.warn("Autofix callback without issue_key (board={})", boardId);
            return;
        }

        JiraAutofixJob job = jobRepository.findDispatchedByIssueKey(boardId, issueKey).orElse(null);
        if (job == null) {
            // 타임아웃으로 이미 회수됐거나 중복 콜백이다. 오류가 아니다.
            log.info("Autofix callback for unknown/settled job: board={} issue={}", boardId, issueKey);
            return;
        }

        String prUrl = text(payload, "pr_url");
        String runUrl = text(payload, "run_url");
        AutofixJobStatus result = resolveResult(payload, prUrl);

        boolean applied = job.complete(result, blankToNull(prUrl), blankToNull(runUrl),
                result == AutofixJobStatus.FAILED ? clip(text(payload, "status"), 1000) : null);
        if (!applied) return;

        log.info("Autofix callback: board={} issue={} result={} pr={}", boardId, issueKey, result, prUrl);
        postJiraComment(boardId, job, result);
    }

    /**
     * 러너가 보낸 job.status와 변경 여부를 조합해 결과를 정한다.
     * 러너가 성공했다고 해도 PR이 없으면 SUCCEEDED로 치지 않는다 — PR이 산출물이다.
     */
    private AutofixJobStatus resolveResult(JsonNode payload, String prUrl) {
        String jobStatus = text(payload, "status");
        String changeResult = text(payload, "result");

        if (!"success".equalsIgnoreCase(jobStatus)) return AutofixJobStatus.FAILED;
        if ("none".equalsIgnoreCase(changeResult)) return AutofixJobStatus.NO_CHANGE;
        if (prUrl == null || prUrl.isBlank()) return AutofixJobStatus.FAILED;
        return AutofixJobStatus.SUCCEEDED;
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
                    + (job.getRunUrl() != null ? " 실행 로그: " + job.getRunUrl() : "");
        };

        try {
            String token = oauthService.resolveToken(config);
            jiraApiClient.addComment(JiraAuthContext.of(config, token), job.getJiraIssueKey(),
                    JiraAdfConverter.toAdf(objectMapper, message));
        } catch (Exception e) {
            log.warn("Autofix: JIRA 결과 댓글 실패 issue={}: {}", job.getJiraIssueKey(), e.getMessage());
        }
    }

    // ── 회수 ──────────────────────────────────────

    /**
     * 콜백이 끝내 오지 않은 작업을 회수한다. 맥이 죽거나 네트워크가 끊기면 발생하며,
     * 이게 없으면 DISPATCHED 하나가 그 보드의 큐를 영구히 막는다.
     *
     * @return 회수한 건수
     */
    @Transactional
    public int sweepStaleDispatches() {
        LocalDateTime deadline = LocalDateTime.now(ZoneOffset.UTC)
                .minusMinutes(properties.getDispatchTimeoutMinutes());
        List<JiraAutofixJob> stale = jobRepository.findStaleDispatched(deadline);
        stale.forEach(JiraAutofixJob::markTimedOut);
        if (!stale.isEmpty()) {
            log.warn("Autofix: {}건이 콜백 없이 타임아웃됐다", stale.size());
        }
        return stale.size();
    }

    // ── 조회 / 취소 ────────────────────────────────

    /**
     * 큐 준비 상태. 셋업이 4단계라 하나만 빠져도 큐가 조용히 멈춘 것처럼 보이므로,
     * 무엇이 빠졌는지 화면이 스스로 설명할 수 있게 전부 내려준다.
     */
    @Transactional(readOnly = true)
    public JiraAutofixResponse.QueueStatus getQueueStatus(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        String repoFullName = null;
        boolean ambiguous = false;
        Boolean workflowReady = null;

        List<BoardGithubRepo> repos = boardGithubRepoRepository.findByBoardIdAndActiveTrue(boardId);
        if (repos.size() > 1) {
            ambiguous = true;
        } else if (repos.size() == 1) {
            BoardGithubRepo repo = repos.get(0);
            repoFullName = repo.getRepoFullName();
            try {
                workflowReady = githubApiClient.hasWorkflow(
                        repo.getInstallation().getInstallationId(), repoFullName, properties.getWorkflowFile());
            } catch (Exception e) {
                // 권한·레이트리밋 문제로 확인 자체가 실패할 수 있다. "없음"이 아니라 "모름"이다.
                log.debug("Autofix: 워크플로 확인 실패 {}: {}", repoFullName, e.getMessage());
            }
        }

        List<JiraAutofixTriage> candidates =
                triageRepository.findByBoardIdAndVerdict(boardId, AutofixVerdict.CANDIDATE);
        int eligible = (int) candidates.stream()
                .filter(t -> t.getConfidence() != null && t.getConfidence() >= properties.getMinConfidence())
                .filter(t -> !jobRepository.existsActiveForIssue(boardId, t.getJiraIssueKey()))
                .count();

        boolean tokenSet = configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::getAutofixCallbackToken)
                .map(t -> t != null && !t.isBlank())
                .orElse(false);

        LocalDateTime dayAgo = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);

        return JiraAutofixResponse.QueueStatus.builder()
                .repoFullName(repoFullName)
                .repoAmbiguous(ambiguous)
                .workflowReady(workflowReady)
                .callbackTokenSet(tokenSet)
                .schedulerEnabled(properties.isSchedulerEnabled())
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

    @Transactional
    public void cancelJob(String boardId, String userId, String jobId) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraAutofixJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND));
        if (!job.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
        }
        if (!job.cancel()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
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
                .status(job.getStatus().name())
                .confidence(job.getConfidence())
                .repoFullName(job.getRepoFullName())
                .prUrl(job.getPrUrl())
                .runUrl(job.getRunUrl())
                .failureReason(job.getFailureReason())
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

    /**
     * 러너가 결과를 POST할 절대 URL. 콜백 토큰이 없으면 빈 문자열을 돌려주고, 워크플로는
     * 회신 단계를 건너뛴다 — 그 경우 작업은 타임아웃 회수에만 의존하게 된다.
     */
    private String buildCallbackUrl(String boardId) {
        if (backendUrl == null || backendUrl.isBlank()) return "";
        return configRepository.findByBoardId(boardId)
                .map(JiraIntegrationConfig::getAutofixCallbackToken)
                .filter(t -> t != null && !t.isBlank())
                .map(t -> backendUrl.replaceAll("/+$", "") + "/api/v1/jira/autofix/callback/" + boardId)
                .orElse("");
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

    private static String clip(String value, int limit) {
        if (value == null) return "";
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private static String toIso(LocalDateTime value) {
        return value != null ? value.toString() : null;
    }
}
