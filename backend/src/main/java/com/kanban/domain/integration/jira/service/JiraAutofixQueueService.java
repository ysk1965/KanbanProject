package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.integration.github.BoardGithubRepo;
import com.kanban.domain.integration.github.BoardGithubRepoRepository;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import com.kanban.domain.integration.jira.dto.JiraAutofixRequest;
import com.kanban.domain.integration.jira.dto.JiraAutofixResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

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
    private final JiraAutofixJobMaterialRepository jobMaterialRepository;
    private final FileUploadService fileUploadService;
    private final JiraIntegrationConfigRepository configRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final CommentRepository commentRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final UserRepository userRepository;
    private final BoardGithubRepoRepository boardGithubRepoRepository;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraAutofixSlackPublisher slackPublisher;

    /** 러너가 보낸 로그 꼬리 상한. 실패 원인을 보기엔 충분하고, 행이 비대해지진 않는 크기. */
    private static final int MAX_LOG_EXCERPT = 8000;

    /** 사람이 쓰는 지시문 상한. 이보다 길면 지시가 아니라 명세서다. */
    private static final int MAX_INSTRUCTION = 4000;

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

        /*
         * 원본 태스크를 한 번에 읽어 둔다. 판정은 스냅샷이라 그 뒤 완료/QA로 넘어간 이슈가
         * 후보에 그대로 남는데, 그걸 담으면 이미 고쳐진 것을 다시 고치려 들고 이슈당 1회
         * 가드레일 때문에 그 후보가 영구히 타버린다.
         */
        List<String> candidateTaskIds = candidates.stream()
                .map(JiraAutofixTriage::getTaskId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<String, Task> taskById = candidateTaskIds.isEmpty() ? Map.of()
                : taskRepository.findByIdInWithBlockAndFeature(candidateTaskIds).stream()
                        .collect(Collectors.toMap(Task::getId, t -> t, (a, b) -> a));

        int queued = 0;
        int skippedLowConfidence = 0;
        int skippedAlreadyQueued = 0;
        int skippedAlreadyDone = 0;
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
            if (triage.getTaskId() != null
                    && AutofixTaskStage.isAlreadyDone(taskById.get(triage.getTaskId()))) {
                skippedAlreadyDone++;
                continue;
            }

            JiraAutofixJob job = JiraAutofixJob.forJiraIssue(
                    board, triage.getJiraIssueKey(), triage.getTaskId(), confidence);
            job.assignTarget(target.installationId(), target.repoFullName(), target.baseRef());
            toSave.add(job);
            queued++;
        }

        jobRepository.saveAll(toSave);
        log.info("Autofix enqueue: board={} queued={} lowConfidence={} alreadyQueued={} alreadyDone={}",
                boardId, queued, skippedLowConfidence, skippedAlreadyQueued, skippedAlreadyDone);

        return JiraAutofixResponse.EnqueueResult.builder()
                .queued(queued)
                .skippedLowConfidence(skippedLowConfidence)
                .skippedAlreadyQueued(skippedAlreadyQueued)
                .skippedAlreadyDone(skippedAlreadyDone)
                .repoFullName(target.repoFullName())
                .baseRef(target.baseRef())
                .build();
    }

    // ── 사람이 직접 맡기기 ──────────────────────────

    /**
     * 태스크나 체크리스트 항목을 사람이 직접 맡긴다. 트리아지를 거치지 않고, 지시문을 사람이 쓴다.
     *
     * <p><b>항목을 여럿 고르면 job도 여럿이다.</b> 하나로 묶지 않는 이유는 실패 단위가 섞이기
     * 때문이다 — 3개 중 1개만 실패해도 PR 전체가 실패로 남고 성공한 2개까지 버려진다.
     * 맥은 어차피 직렬이라 묶든 나누든 총 소요는 같다.
     *
     * <p>확신도 임계값은 적용하지 않는다(점수가 없다). "이슈당 1회"도 적용하지 않는다 — 실패한
     * 작업의 지시문을 고쳐 다시 맡기는 것이 정상 흐름이라, 대신 <b>동시에 하나</b>만 막는다.
     */
    @Transactional
    public JiraAutofixResponse.DelegateResult delegate(String boardId, String userId,
                                                       JiraAutofixRequest.Delegate request) {
        boardService.checkAdminOrAbove(boardId, userId);

        String instruction = request != null ? trimToNull(request.getInstruction()) : null;
        if (instruction == null) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_INSTRUCTION_REQUIRED);
        }
        if (instruction.length() > MAX_INSTRUCTION) {
            instruction = instruction.substring(0, MAX_INSTRUCTION);
        }

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Task task = taskRepository.findById(nullToEmpty(request.getTaskId()))
                .filter(t -> t.getBlock() != null && t.getBlock().getBoard() != null
                        && boardId.equals(t.getBlock().getBoard().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        /*
         * 맥이 준비되지 않았으면 담지 않는다. 검증 클론이 없으면 코드를 다 고친 뒤 PR 직전에
         * 실패하는데, 그 40분은 큐 전체가 멈춰 있는 시간이다. 도크가 QA 후보 담기를 막는 것과
         * 같은 판단이다. (러너가 아직 아무것도 안 보냈으면 "모름"이므로 막지 않는다.)
         */
        if (isRunnerVerifyNotReady(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_RUNNER_NOT_READY);
        }

        DispatchTarget target = resolveTarget(boardId);

        List<String> itemIds = request.getChecklistItemIds() != null
                ? request.getChecklistItemIds().stream().filter(Objects::nonNull).distinct().toList()
                : List.of();

        List<JiraAutofixJob> created = new ArrayList<>();
        int skipped = 0;

        if (itemIds.isEmpty()) {
            // 태스크 전체 위임
            if (jobRepository.existsPendingForTask(boardId, task.getId())) {
                throw new BusinessException(ErrorCode.JIRA_AUTOFIX_ALREADY_DELEGATED);
            }
            created.add(JiraAutofixJob.forManualTask(board, task.getId(), instruction, userId));
        } else {
            /*
             * 고른 항목이 전부 이 태스크의 것인지 확인한다. 다른 태스크의 항목 id가 섞이면
             * 맥락 조립이 엉뚱한 태스크 설명을 붙여 보낸다 — 에이전트는 그걸 사실로 읽는다.
             */
            Map<String, ChecklistItem> itemById =
                    checklistItemRepository.findByTaskIdOrderByPositionAsc(task.getId()).stream()
                            .collect(Collectors.toMap(ChecklistItem::getId, i -> i, (a, b) -> a));

            for (String itemId : itemIds) {
                if (!itemById.containsKey(itemId)) {
                    throw new BusinessException(ErrorCode.JIRA_AUTOFIX_INVALID_CHECKLIST_ITEM);
                }
            }
            if (itemIds.size() > properties.getMaxEnqueuePerRequest()) {
                itemIds = itemIds.subList(0, properties.getMaxEnqueuePerRequest());
            }

            for (String itemId : itemIds) {
                if (jobRepository.existsPendingForChecklistItem(boardId, itemId)) {
                    skipped++;   // 이미 맡긴 항목은 조용히 건너뛴다 — 나머지까지 막을 이유가 없다
                    continue;
                }
                created.add(JiraAutofixJob.forManualChecklistItem(
                        board, task.getId(), itemId, instruction, userId));
            }
            if (created.isEmpty()) {
                throw new BusinessException(ErrorCode.JIRA_AUTOFIX_ALREADY_DELEGATED);
            }
        }

        created.forEach(job ->
                job.assignTarget(target.installationId(), target.repoFullName(), target.baseRef()));
        jobRepository.saveAll(created);

        attachDelegateMaterials(boardId, task.getId(), request.getFileKeys(), created);

        log.info("Autofix delegate: board={} task={} items={} queued={} skipped={} files={} by={}",
                boardId, task.getId(), itemIds.size(), created.size(), skipped,
                request.getFileKeys() != null ? request.getFileKeys().size() : 0, userId);

        return JiraAutofixResponse.DelegateResult.builder()
                .queued(created.size())
                .skippedAlreadyDelegated(skipped)
                .repoFullName(target.repoFullName())
                .baseRef(target.baseRef())
                .jobs(created.stream().map(this::toItem).toList())
                .build();
    }

    /**
     * 위임 화면에서 올린 스크린샷·재현 영상을 작업에 붙인다.
     *
     * <p>파일은 <b>한 번만</b> 영구 저장소로 옮기고, 만들어진 작업 전부가 같은 URL을 가리킨다.
     * 항목마다 복사하면 같은 그림이 용량만 N배로 남는다.
     *
     * <p>실패하면 이미 옮긴 것을 되돌린다 — 트랜잭션이 롤백돼도 S3는 함께 돌아가지 않아서,
     * 정리하지 않으면 아무 행도 가리키지 않는 객체가 버킷에 남는다. (댓글 첨부와 같은 처리다.)
     */
    private void attachDelegateMaterials(String boardId, String taskId, List<String> fileKeys,
                                         List<JiraAutofixJob> jobs) {
        if (fileKeys == null || jobs.isEmpty()) return;

        List<String> keys = fileKeys.stream()
                .filter(k -> k != null && !k.isBlank())
                .distinct()
                .toList();
        if (keys.isEmpty()) return;
        if (keys.size() > properties.getMaxDelegateMaterials()) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_TOO_MANY_MATERIALS);
        }

        long maxBytes = (long) properties.getMaxDelegateMaterialMb() * 1024L * 1024L;
        List<String> movedKeys = new ArrayList<>();
        List<JiraAutofixJobMaterial> rows = new ArrayList<>();

        try {
            for (String tempKey : keys) {
                if (!fileUploadService.tempFileExists(tempKey)) {
                    throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
                }
                /*
                 * 옮기기 전에 크기를 본다. 옮긴 뒤에 재면 상한을 넘은 파일을 이미 복사한 뒤이고,
                 * 영상은 그 복사 자체가 비싸다. (크기를 모르는 구현은 -1을 주므로 아래에서 다시 잰다.)
                 */
                long probed = fileUploadService.probeObjectSize(tempKey);
                if (probed > 0 && probed > maxBytes) {
                    throw new BusinessException(ErrorCode.JIRA_AUTOFIX_MATERIAL_TOO_LARGE);
                }

                FileUploadService.PermanentResult moved =
                        fileUploadService.moveToPermanent(tempKey, boardId, taskId);
                movedKeys.add(moved.getS3Key());

                if (moved.getFileSize() > maxBytes) {
                    throw new BusinessException(ErrorCode.JIRA_AUTOFIX_MATERIAL_TOO_LARGE);
                }
                /*
                 * 이미지·영상만 받는다. 업로드 단계에서도 매직바이트로 거르지만, 여기서 한 번 더 보는
                 * 이유는 러너가 아닌 것을 받으면 조용히 버리기 때문이다 — 사람은 첨부가 나갔다고 믿는다.
                 */
                String contentType = nullToEmpty(moved.getContentType());
                if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
                    throw new BusinessException(ErrorCode.JIRA_AUTOFIX_MATERIAL_NOT_MEDIA);
                }

                String filename = tempKey.contains("/")
                        ? tempKey.substring(tempKey.lastIndexOf("/") + 1)
                        : tempKey;

                for (JiraAutofixJob job : jobs) {
                    rows.add(JiraAutofixJobMaterial.of(job.getId(), filename, moved.getS3Key(),
                            moved.getUrl(), moved.getContentType(), moved.getFileSize()));
                }
            }
            jobMaterialRepository.saveAll(rows);
        } catch (RuntimeException e) {
            for (String key : movedKeys) {
                try {
                    fileUploadService.delete(key);
                } catch (Exception ignored) {
                    log.warn("Autofix delegate material cleanup failed: {}", key);
                }
            }
            throw e;
        }
    }

    /**
     * 러너가 "검증 클론이 준비되지 않았다"고 명시적으로 보고했는가.
     *
     * <p>모르는 것(구버전 러너·진단 실패)은 막지 않는다. 알 수 없는 상태를 문제로 취급하면
     * 멀쩡한 맥을 세우게 된다 — 이건 러너 자가진단 전반에 걸친 규칙이다.
     */
    private boolean isRunnerVerifyNotReady(String boardId) {
        JsonNode status = parseRunnerStatus(configRepository.findByBoardId(boardId).orElse(null));
        if (status == null) return false;
        JsonNode verifyReady = status.get("verify_ready");
        return verifyReady != null && verifyReady.isBoolean() && !verifyReady.asBoolean();
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
                                                 Integer contractVersion,
                                                 JiraAutofixRequest.RunnerStatus status) {
        touchRunner(boardId, runnerName, contractVersion, status);

        // 계약 검사는 다른 어떤 판정보다 앞에 온다. 낡은 러너에게 작업을 내주면 그 건은 반드시
        // 실패하고, 실패 한 건이 회수 시각까지 큐 전체를 막은 뒤 그 대상을 영구히 태운다.
        // 여기서 막으면 작업은 QUEUED로 그대로 남아, 스크립트를 갱신하는 즉시 이어서 돈다.
        if (!AutofixRunnerContract.matches(contractVersion)) {
            log.warn("Autofix claim rejected — 계약 불일치: board={} runner={} runnerContract={} serverContract={}",
                    boardId, runnerName, contractVersion, AutofixRunnerContract.VERSION);
            return JiraAutofixResponse.ClaimResult.of(null, "CONTRACT_MISMATCH");
        }

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
                boardId, job.getJobKey(), job.getRepoFullName(), runnerName);
        return JiraAutofixResponse.ClaimResult.of(buildRunnerJob(job), "CLAIMED");
    }

    /** 러너가 살아 있다는 신호만 받는다 — 긴 작업 중에는 claim을 부르지 않기 때문이다. */
    @Transactional
    public void heartbeat(String boardId, String runnerName, Integer contractVersion,
                          JiraAutofixRequest.RunnerStatus status) {
        touchRunner(boardId, runnerName, contractVersion, status);
    }

    /**
     * 러너 생존·자가진단 반영.
     *
     * <p>러너가 보낸 값을 그대로 저장하지 않고 서버가 아는 필드만 뽑아 다시 직렬화한다 —
     * 이 엔드포인트는 보드 토큰만으로 열려 있어서, 임의의 문자열이 DB에 들어가는 통로가 되면 안 된다.
     */
    private void touchRunner(String boardId, String runnerName, Integer contractVersion,
                             JiraAutofixRequest.RunnerStatus status) {
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
                .ifPresent(config -> config.touchAutofixRunner(runnerName, json, contractVersion));
    }

    /**
     * 러너가 받아갈 작업 명세.
     *
     * <p>이슈 본문은 JIRA를 다시 부르지 않고 가져온 Task에서 읽는다 — import 시점에 이미 평문으로
     * 변환해 저장해 뒀고, 매번 JIRA를 때리면 레이트 리밋만 소모한다.
     *
     * <p>브랜치 이름은 큐에 담을 때 확정해 뒀다. 러너가 정하면 재실행·수동 실행마다 규칙이 흔들리고,
     * 여기서 매번 조립하면 러너가 실제로 push한 브랜치와 화면이 어긋난다.
     */
    private JiraAutofixResponse.RunnerJob buildRunnerJob(JiraAutofixJob job) {
        Task task = job.getTaskId() != null
                ? taskRepository.findById(job.getTaskId()).orElse(null) : null;

        ChecklistItem item = job.getChecklistItemId() != null
                ? checklistItemRepository.findById(job.getChecklistItemId()).orElse(null) : null;

        String title = resolveJobTitle(job, task, item);
        String instruction = job.getJobKind().isManual()
                ? buildManualInstruction(job, task, item)
                : buildJiraInstruction(job, task);

        return JiraAutofixResponse.RunnerJob.builder()
                .jobId(job.getId())
                .jobKey(job.getJobKey())
                .jobKind(job.getJobKind().name())
                .title(clip(title, 200))
                .instruction(clip(instruction, 12000))
                .repoFullName(job.getRepoFullName())
                .baseRef(nullToEmpty(job.getBaseRef()))
                .branch(defaultIfBlank(job.getBranchName(), "autofix/" + job.getJobKey()))
                .timeoutMinutes(Math.min(properties.getRunnerTimeoutMinutes(),
                        properties.getDispatchTimeoutMinutes()))
                .comments(collectComments(job.getTaskId()))
                .materials(collectMaterials(job))
                .build();
    }

    /**
     * PR 제목이 되는 값.
     *
     * <p>체크리스트 위임이면 <b>항목 제목</b>이다. 태스크 제목을 쓰면 리뷰어가 카드 전체 변경을
     * 기대하고 PR을 여는데, 실제로 담긴 것은 항목 하나짜리 수정이다.
     */
    private String resolveJobTitle(JiraAutofixJob job, Task task, ChecklistItem item) {
        if (item != null && item.getTitle() != null && !item.getTitle().isBlank()) {
            return item.getTitle();
        }
        if (task != null && task.getTitle() != null && !task.getTitle().isBlank()) {
            return task.getTitle();
        }
        return job.getJobKey();
    }

    /** 트리아지가 고른 JIRA 이슈 — 기존 문구를 그대로 조립한다. 러너 입장에서는 차이가 없다. */
    private String buildJiraInstruction(JiraAutofixJob job, Task task) {
        String verification = triageRepository
                .findByBoardIdAndJiraIssueKey(job.getBoard().getId(), job.getJobKey())
                .map(JiraAutofixTriage::getVerification)
                .orElse("");

        TestInfraLevel testInfra = configRepository.findByBoardId(job.getBoard().getId())
                .map(JiraIntegrationConfig::resolveAutofixTestInfra)
                .orElse(TestInfraLevel.NONE);

        StringBuilder sb = new StringBuilder();
        sb.append("아래 QA 이슈를 고쳐라.\n\n");
        sb.append("이슈 ").append(job.getJobKey());
        if (task != null && task.getTitle() != null) sb.append(": ").append(task.getTitle());
        sb.append("\n\n");
        if (task != null) sb.append(clip(nullToEmpty(task.getDescription()), 8000)).append("\n\n");
        if (!verification.isBlank()) {
            sb.append("트리아지가 본 검증 수단: ").append(clip(verification, 500)).append("\n");
        }
        if (testInfra == TestInfraLevel.NONE) {
            sb.append("이 저장소에는 테스트가 없다. 테스트를 새로 만들지 말고 코드 수정만 한다.\n");
        }
        return sb.toString();
    }

    /**
     * 사람이 맡긴 작업 — 맥락 · 대상 · 지시 세 부분으로 조립한다.
     *
     * <p><b>체크리스트 항목에는 설명 필드가 없다.</b> {@code title} 200자가 전부라 그대로 보내면
     * 에이전트가 받는 지시는 "저장 버튼 비활성화" 한 줄이고, 그걸로는 아무것도 못 한다. 그래서 부모
     * 태스크의 제목·설명이 <b>항상</b> 맥락으로 함께 나간다.
     *
     * <p>그리고 맥락을 붙이면 곧바로 반대 문제가 생긴다 — 에이전트가 태스크 설명 전체를 보고 범위를
     * 넓힌다. <b>"다른 항목은 건드리지 않는다"가 그래서 필수 문장이다.</b> 이게 없으면 항목 하나짜리
     * PR을 기대한 리뷰어가 카드 전체 변경을 받는다.
     */
    private String buildManualInstruction(JiraAutofixJob job, Task task, ChecklistItem item) {
        StringBuilder sb = new StringBuilder();

        sb.append("[맥락] 이 작업이 속한 태스크");
        if (task != null) {
            sb.append(": ").append(nullToEmpty(task.getTitle())).append("\n");
            String description = clip(nullToEmpty(task.getDescription()), 8000);
            if (!description.isBlank()) sb.append(description).append("\n");
        } else {
            sb.append(": (원본 태스크를 찾을 수 없다)\n");
        }
        sb.append("\n");

        if (job.isChecklistScoped()) {
            String itemTitle = item != null ? nullToEmpty(item.getTitle()) : "";
            sb.append("[대상] 위 태스크의 체크리스트 항목 하나만 처리한다: \"")
              .append(itemTitle.isBlank() ? job.getJobKey() : itemTitle).append("\"\n");
            sb.append("태스크 설명에 있는 다른 항목은 건드리지 않는다.\n\n");
        } else {
            sb.append("[대상] 위 태스크를 처리한다.\n\n");
        }

        sb.append("[지시]\n").append(nullToEmpty(job.getInstruction()));
        return sb.toString();
    }

    /**
     * 이슈 댓글 — 오래된 것부터 상한까지.
     *
     * <p>최신순이 아니라 오래된 순인 이유: 재현 절차는 시간 순서대로 읽어야 말이 된다.
     * 상한을 넘으면 뒤(최신)를 남긴다 — 뒤로 갈수록 확정된 정보다.
     */
    private List<JiraAutofixResponse.IssueComment> collectComments(String taskId) {
        if (taskId == null) return List.of();

        List<Comment> comments = commentRepository.findByTaskIdWithAuthor(taskId);
        if (comments.isEmpty()) return List.of();

        List<Comment> ordered = comments.stream()
                .sorted(Comparator.comparing(Comment::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        int cap = properties.getMaxJobComments();
        List<Comment> capped = ordered.size() > cap
                ? ordered.subList(ordered.size() - cap, ordered.size())
                : ordered;

        return capped.stream()
                .map(c -> JiraAutofixResponse.IssueComment.builder()
                        .author(c.getAuthor() != null ? c.getAuthor().getName() : "알 수 없음")
                        .createdAt(c.getCreatedAt() != null ? c.getCreatedAt().toString() : "")
                        .body(clip(nullToEmpty(c.getContent()), 2000))
                        .build())
                .toList();
    }

    /**
     * 스크린샷·영상 목록.
     *
     * <p>지라 첨부는 import 시점에 이미 내려받아 S3에 올라가 있다({@code importAttachmentAsComment}).
     * 그래서 여기서 지라를 다시 부르지 않는다 — 부르면 claim마다 API를 때리고, 지라 자격증명이
     * 러너까지 내려가야 하는 설계로 밀린다.
     *
     * <p><b>맡길 때 올린 자료를 앞에 둔다.</b> 러너는 상한을 넘긴 자료를 뒤에서부터 버리는데,
     * 댓글 첨부가 먼저 오면 "이걸 보고 고쳐 달라"며 방금 올린 그림이 잘려 나간다. 사람이 이번
     * 위임을 위해 고른 파일이 태스크에 쌓여 온 첨부보다 언제나 지시문에 가깝다.
     */
    private List<JiraAutofixResponse.Material> collectMaterials(JiraAutofixJob job) {
        List<JiraAutofixResponse.Material> materials = new ArrayList<>();
        Set<String> seenUrls = new HashSet<>();

        for (JiraAutofixJobMaterial m : jobMaterialRepository.findByJobIdOrderByCreatedAtAsc(job.getId())) {
            if (m.getUrl() == null || m.getUrl().isBlank()) continue;
            if (!seenUrls.add(m.getUrl())) continue;
            materials.add(JiraAutofixResponse.Material.builder()
                    .filename(nullToEmpty(m.getOriginalFileName()))
                    .mimeType(nullToEmpty(m.getContentType()))
                    .size(m.getFileSize())
                    .url(m.getUrl())
                    .build());
        }

        if (job.getTaskId() != null) {
            for (var a : commentAttachmentRepository.findByTaskId(job.getTaskId())) {
                if (a.getUrl() == null || a.getUrl().isBlank()) continue;
                if (!seenUrls.add(a.getUrl())) continue;
                materials.add(JiraAutofixResponse.Material.builder()
                        .filename(nullToEmpty(a.getOriginalFileName()))
                        .mimeType(nullToEmpty(a.getContentType()))
                        .size(a.getFileSize())
                        .url(a.getUrl())
                        .build());
            }
        }

        return materials.size() > properties.getMaxJobMaterials()
                ? materials.subList(0, properties.getMaxJobMaterials())
                : materials;
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

        String excerpt = blankToNull(clip(text(payload, "log_excerpt"), MAX_LOG_EXCERPT));
        boolean corrected = job.getStatus() == AutofixJobStatus.TIMED_OUT;

        boolean applied = corrected
                ? job.reconcileAfterTimeout(result, prUrl, failureReason, excerpt)
                : job.complete(result, prUrl, failureReason, excerpt);
        if (!applied) return;

        if (corrected) {
            log.warn("Autofix late callback: board={} job={} TIMED_OUT → {} pr={}",
                    boardId, job.getJobKey(), result, prUrl);
        } else {
            log.info("Autofix result: board={} job={} result={} pr={}",
                    boardId, job.getJobKey(), result, prUrl);
        }

        // 출처에 따라 결과가 돌아가는 자리가 다르다. MANUAL은 JIRA 이슈가 아예 없다.
        if (job.getJobKind().isManual()) {
            postTaskComment(job, result);
        } else {
            postJiraComment(boardId, job, result);
        }
        notifySlack(job, corrected);
    }

    /**
     * 회신을 반영할 작업을 찾는다.
     *
     * <p>{@code DISPATCHED}가 정상 경로이고, {@code TIMED_OUT}은 회수된 뒤 늦게 도착한 회신이다 —
     * 러너가 회신에 실패하면 스풀에 쌓았다가 다시 보내므로 서버가 먼저 회수한 뒤에 올 수 있다.
     * 그 늦은 회신을 버리면 실제로는 PR이 열렸는데 보드는 실패라고 말하는 상태가 굳는다.
     *
     * <p>{@code issue_key}도 계속 받아준다. 구버전 러너가 붙어 있을 수 있고, 사람이 손으로 한 건을
     * 돌려볼 때 job id 없이 회신하는 경로도 그대로다.
     */
    private JiraAutofixJob findCallbackTarget(String boardId, JsonNode payload) {
        String jobId = blankToNull(text(payload, "job_id"));
        String jobKey = blankToNull(text(payload, "job_key"));
        if (jobKey == null) jobKey = blankToNull(text(payload, "issue_key"));

        JiraAutofixJob job = jobId != null
                ? jobRepository.findById(jobId)
                        .filter(j -> j.getBoard().getId().equals(boardId))
                        .filter(j -> j.getStatus() == AutofixJobStatus.DISPATCHED
                                || j.getStatus() == AutofixJobStatus.TIMED_OUT)
                        .orElse(null)
                : jobKey != null
                        ? jobRepository.findCallbackTargetsByJobKey(boardId, jobKey)
                                .stream().findFirst().orElse(null)
                        : null;

        if (job == null) {
            log.info("Autofix callback for unknown/settled job: board={} job={} key={}",
                    boardId, jobId, jobKey);
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
            jiraApiClient.addComment(JiraAuthContext.of(config, token), job.getJobKey(),
                    JiraAdfConverter.toAdf(objectMapper, message));
        } catch (Exception e) {
            log.warn("Autofix: JIRA 결과 댓글 실패 issue={}: {}", job.getJobKey(), e.getMessage());
        }
    }

    /**
     * 사람이 맡긴 작업의 결과를 <b>맡긴 카드</b>에 남긴다.
     *
     * <p>위임한 사람이 도크를 계속 열어둘 이유는 없다. 카드에 남아야 나중에 맥락이 이어진다.
     * 체크리스트 항목에는 댓글 기능이 없으므로 부모 태스크에 달고, 어느 항목이었는지는 본문이 밝힌다.
     *
     * <p>알림 이벤트를 태우지 않고 리포지토리에 바로 저장한다 — 맡긴 사람이 작성자라 알림이
     * 자기 자신에게 가고, 자동수정 결과는 이미 도크·슬랙·카드 세 곳에 남는다.
     *
     * <p>실패해도 삼킨다. 이 시점에 작업 상태는 확정됐고, 댓글이 안 달렸다고 되돌릴 것이 없다.
     */
    private void postTaskComment(JiraAutofixJob job, AutofixJobStatus result) {
        if (job.getTaskId() == null) return;

        try {
            Task task = taskRepository.findById(job.getTaskId()).orElse(null);
            if (task == null) return;

            StringBuilder body = new StringBuilder();
            if (job.isChecklistScoped()) {
                String itemTitle = checklistItemRepository.findById(job.getChecklistItemId())
                        .map(ChecklistItem::getTitle).orElse(null);
                body.append("체크리스트: ").append(defaultIfBlank(itemTitle, job.getJobKey())).append("\n");
            }
            body.append(switch (result) {
                case SUCCEEDED -> "맥에서 수정을 마치고 PR을 열었습니다.\n" + job.getPrUrl()
                        + "\n컴파일 검증 통과 · 동작은 확인되지 않았습니다. 머지 전 검토가 필요하며,"
                        + " 항목 체크는 켜지 않았습니다.";
                case NO_CHANGE -> "맥이 이 작업을 자동으로 처리할 수 없다고 판단해 변경 없이 끝났습니다.";
                default -> "맥에서 작업이 실패해 PR을 만들지 않았습니다."
                        + (job.getFailureReason() != null ? "\n사유: " + job.getFailureReason() : "");
            });

            User author = job.getCreatedBy() != null
                    ? userRepository.findById(job.getCreatedBy()).orElse(null) : null;

            commentRepository.save(Comment.builder()
                    .task(task)
                    .board(job.getBoard())
                    .author(author)
                    .content(clip(body.toString(), 4000))
                    .build());
        } catch (Exception e) {
            log.warn("Autofix: 태스크 결과 댓글 실패 job={}: {}", job.getJobKey(), e.getMessage());
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
        notifySlack(job, false);
    }

    /** @param corrected 회수 뒤 늦은 회신으로 결과가 뒤집힌 경우. 채널에 앞선 메시지가 이미 있다. */
    private void notifySlack(JiraAutofixJob job, boolean corrected) {
        if (!properties.isSlackNotifyEnabled()) return;

        String boardId = job.getBoard().getId();
        String title = job.getTaskId() != null
                ? taskRepository.findById(job.getTaskId()).map(Task::getTitle).orElse(null)
                : null;
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId).orElse(null);
        String jiraBaseUrl = config != null ? config.getBaseUrl() : null;

        slackPublisher.publish(job.getBoard(), job, title, jiraBaseUrl,
                config != null ? config.getAutofixSlackChannelId() : null, corrected);
    }

    // ── 회수 ──────────────────────────────────────

    /**
     * 소식이 끊긴 러너를 슬랙으로 알린다.
     *
     * <p>이게 없으면 러너의 죽음은 아무 신호도 내지 않는다 — {@code autofixRunnerSeenAt}을 읽는
     * 곳이 화면 조회 하나뿐이라 도크를 열어본 사람만 알고, 그때까지 파이프라인은 그냥 꺼져 있다.
     * {@link #sweepStaleDispatches}가 알리는 것은 <b>물고 있던 작업</b>이지 러너 자체가 아니므로,
     * 큐가 빈 채로 러너가 죽으면 그쪽은 영원히 조용하다.
     *
     * <p><b>대기 중인 작업이 있을 때만 알린다.</b> 시킬 일이 없는데 러너가 꺼져 있는 것은 사고가
     * 아니라 상태다. 손해가 없는 시점에 사람을 부르면 정작 필요할 때 무시당한다.
     */
    @Transactional
    public int alertOfflineRunners() {
        LocalDateTime deadline = LocalDateTime.now(ZoneOffset.UTC)
                .minusMinutes(properties.getRunnerOfflineAlertMinutes());

        int alerted = 0;
        for (JiraIntegrationConfig config : configRepository.findRunnersGoneSilent(deadline)) {
            String boardId = config.getBoard().getId();
            long queued = jobRepository.countQueued(boardId);
            if (queued == 0) continue;

            config.markRunnerOfflineAlerted();
            alerted++;
            log.warn("Autofix: 러너 무응답 board={} runner={} seen={} queued={}",
                    boardId, config.getAutofixRunnerName(), config.getAutofixRunnerSeenAt(), queued);

            if (!properties.isSlackNotifyEnabled()) continue;
            slackPublisher.publishRunnerOffline(config.getBoard(), config.getAutofixRunnerName(),
                    config.getAutofixRunnerSeenAt(), (int) queued, config.getAutofixSlackChannelId());
        }
        return alerted;
    }

    /**
     * 살아 있는데 계약이 어긋나 아무것도 못 하는 러너를 알린다.
     *
     * <p>{@link #alertOfflineRunners}가 이 고장을 잡지 못한다. 러너는 20초마다 말을 걸어오고
     * 자가진단도 전부 초록이라 그쪽 조건({@code seenAt < deadline})에 영원히 걸리지 않는다.
     * 실제로 2026-08-05에 한 시간 넘게 아무 신호도 나가지 않았다 — 도크를 열어본 사람만 알았다.
     *
     * <p>대기 중인 작업이 있을 때만 알린다. 시킬 일이 없는데 러너 스크립트가 낡은 것은 사고가
     * 아니라 상태다 — 무응답 알림과 같은 기준이다.
     */
    @Transactional
    public int alertContractDrift() {
        LocalDateTime deadline = LocalDateTime.now(ZoneOffset.UTC)
                .minusMinutes(properties.getRunnerOnlineWindowMinutes());

        int alerted = 0;
        for (JiraIntegrationConfig config : configRepository.findRunnersOnContractDrift(
                deadline, AutofixRunnerContract.VERSION)) {
            String boardId = config.getBoard().getId();
            long queued = jobRepository.countQueued(boardId);
            if (queued == 0) continue;

            config.markContractAlerted();
            alerted++;
            log.warn("Autofix: 러너 계약 불일치 board={} runner={} runnerContract={} serverContract={} queued={}",
                    boardId, config.getAutofixRunnerName(), config.getAutofixRunnerContract(),
                    AutofixRunnerContract.VERSION, queued);

            if (!properties.isSlackNotifyEnabled()) continue;
            slackPublisher.publishContractDrift(config.getBoard(), config.getAutofixRunnerName(),
                    config.getAutofixRunnerContract(), AutofixRunnerContract.VERSION,
                    (int) queued, config.getAutofixSlackChannelId());
        }
        return alerted;
    }

    /**
     * 회신이 끝내 오지 않은 작업을 회수한다. 맥이 죽거나 잠들거나 네트워크가 끊기면 발생하며,
     * 이게 없으면 DISPATCHED 하나가 그 보드의 큐를 영구히 막는다.
     *
     * <p>회수는 <b>추정</b>이다. 러너가 살아서 PR까지 만들고 회신만 유실했을 수 있으므로,
     * 늦게 도착한 회신은 {@link JiraAutofixJob#reconcileAfterTimeout}로 이 판정을 뒤집는다.
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

        // 담기와 같은 기준으로 센다 — 여기 숫자와 실제로 담기는 수가 다르면 화면이 거짓말을 한다
        List<String> candidateTaskIds = candidates.stream()
                .map(JiraAutofixTriage::getTaskId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<String, Task> statusTaskById = candidateTaskIds.isEmpty() ? Map.of()
                : taskRepository.findByIdInWithBlockAndFeature(candidateTaskIds).stream()
                        .collect(Collectors.toMap(Task::getId, t -> t, (a, b) -> a));

        int eligible = (int) candidates.stream()
                .filter(t -> t.getConfidence() != null && t.getConfidence() >= properties.getMinConfidence())
                .filter(t -> t.getTaskId() == null
                        || !AutofixTaskStage.isAlreadyDone(statusTaskById.get(t.getTaskId())))
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
                .runnerContractVersion(config != null ? config.getAutofixRunnerContract() : null)
                .serverContractVersion(AutofixRunnerContract.VERSION)
                .callbackTokenSet(tokenSet)
                .dispatchEnabled(properties.isDispatchEnabled())
                .inFlight((int) jobRepository.countInFlight(boardId))
                .queued((int) jobRepository.countQueued(boardId))
                .queuedManual((int) jobRepository.countQueuedManual(boardId))
                .dispatchedToday((int) jobRepository.countDispatchedSince(boardId, dayAgo))
                .dailyLimit(properties.getDailyLimit())
                .minConfidence(properties.getMinConfidence())
                .eligibleCandidates(eligible)
                .totalCandidates(candidates.size())
                .slackChannelId(config != null ? config.getAutofixSlackChannelId() : null)
                .slackChannelName(config != null ? config.getAutofixSlackChannelName() : null)
                .slackNotifyEnabled(properties.isSlackNotifyEnabled())
                .build();
    }

    /**
     * 결과를 게시할 슬랙 채널을 지정하거나 해제한다. 채널 ID를 비우면 해제이고, 그때는 설치
     * 기본 채널로 떨어진다 — 알림을 완전히 끄는 스위치가 아니다.
     */
    @Transactional
    public void updateSlackChannel(String boardId, String userId, String channelId, String channelName) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        config.updateAutofixSlackChannel(channelId, channelName);
    }

    @Transactional(readOnly = true)
    public List<JiraAutofixResponse.JobItem> getJobs(String boardId, String userId, int limit) {
        boardService.checkMemberOrAbove(boardId, userId);
        return jobRepository.findByBoardId(boardId, PageRequest.of(0, Math.min(limit, 200))).stream()
                .map(this::toItem)
                .toList();
    }

    /**
     * 태스크 하나의 작업만. 카드가 자기 체크리스트 항목들의 상태 칩을 그리는 경로다.
     *
     * <p>전체 목록을 받아 화면에서 거르지 않는 이유는 단순하다 — 카드 하나 열 때마다
     * 보드의 큐 전체가 넘어온다.
     */
    @Transactional(readOnly = true)
    public List<JiraAutofixResponse.JobItem> getJobsForTask(String boardId, String userId, String taskId) {
        boardService.checkMemberOrAbove(boardId, userId);
        return jobRepository.findByBoardIdAndTaskId(boardId, taskId).stream()
                .map(this::toItem)
                .toList();
    }

    /**
     * 작업 취소. 기본은 아직 나가지 않은 QUEUED만이다.
     *
     * <p>{@code force}는 두 가지를 겸한다. 러너가 물고 있는 {@code DISPATCHED}를 놓아주는 것과,
     * 이미 끝나버린 {@code TIMED_OUT}·{@code FAILED}를 <b>다시 담을 수 있게 비우는</b> 것이다.
     * 후자가 없으면 러너 쪽 사고 한 번에 그 대상이 영구히 자동수정에서 빠진다 —
     * "이슈당 1회" 가드({@code existsActiveForIssue})가 {@code CANCELLED} 외의 모든 상태를
     * "이미 처리함"으로 세기 때문이다. 그 가드의 목적은 <b>중복 PR 방지</b>이지 사고 시 영구 배제가
     * 아니므로, 산출물이 실제로 나온 {@code SUCCEEDED}만 잠가 두면 충분하다.
     *
     * @param force true면 DISPATCHED 강제 회수 + 종료된 실패 건(TIMED_OUT/FAILED) 재시도 허용.
     *              맥에서 돌고 있는 실제 작업이 멈추지는 않는다. 늦게 도착한 회신은 이미
     *              CANCELLED가 된 작업을 덮지 못해 무시된다.
     */
    @Transactional
    public void cancelJob(String boardId, String userId, String jobId, boolean force) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraAutofixJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND));
        if (!job.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_FOUND);
        }
        AutofixJobStatus before = job.getStatus();
        boolean applied = job.cancel() || (force && (job.release() || job.discardForRetry()));
        if (!applied) {
            throw new BusinessException(ErrorCode.JIRA_AUTOFIX_JOB_NOT_CANCELLABLE);
        }
        if (force) {
            log.warn("Autofix job force-released: board={} key={} {} → CANCELLED",
                    boardId, job.getJobKey(), before);
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

    /**
     * 화면이 쓰는 형태로 옮긴다.
     *
     * <p>제목을 둘로 나눠 싣는 이유: 체크리스트 위임은 <b>항목 제목</b>이 본문이고
     * <b>부모 태스크 제목</b>이 보조 줄이다. "중복 이름 검사 추가"만으로는 어느 카드 일인지
     * 알 수 없고, 반대로 태스크 제목만 보이면 무엇을 맡겼는지 알 수 없다.
     */
    private JiraAutofixResponse.JobItem toItem(JiraAutofixJob job) {
        Task task = job.getTaskId() != null
                ? taskRepository.findById(job.getTaskId()).orElse(null) : null;
        ChecklistItem item = job.getChecklistItemId() != null
                ? checklistItemRepository.findById(job.getChecklistItemId()).orElse(null) : null;

        String parentTitle = task != null ? task.getTitle() : null;
        String title = item != null ? item.getTitle()
                : (parentTitle != null ? parentTitle : job.getJobKey());

        String createdByName = job.getCreatedBy() != null
                ? userRepository.findById(job.getCreatedBy()).map(User::getName).orElse(null)
                : null;

        return JiraAutofixResponse.JobItem.builder()
                .id(job.getId())
                .jobKey(job.getJobKey())
                .jobKind(job.getJobKind().name())
                .taskId(job.getTaskId())
                .checklistItemId(job.getChecklistItemId())
                // 체크리스트 위임일 때만 보조 줄이 필요하다. 태스크 위임은 title이 곧 카드 제목이다.
                .parentTaskTitle(item != null ? parentTitle : null)
                .title(clip(title, 200))
                .instruction(clip(nullToEmpty(job.getInstruction()), 500))
                .createdBy(job.getCreatedBy())
                .createdByName(createdByName)
                .status(job.getStatus().name())
                .confidence(job.getConfidence())
                .repoFullName(job.getRepoFullName())
                .branchName(job.getBranchName())
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

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
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
