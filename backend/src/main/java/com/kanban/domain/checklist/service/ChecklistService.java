package com.kanban.domain.checklist.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistBatchRequest;
import com.kanban.domain.checklist.dto.ChecklistBatchResponse;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.contractor.repository.BoardContractorRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.service.InboxFeatureService;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.integration.discord.service.DiscordNotificationService;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.sprint.service.SprintService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChecklistService {

    private final ChecklistItemRepository checklistItemRepository;
    private final SprintService sprintService;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final BoardContractorRepository contractorRepository;
    private final FeatureRepository featureRepository;
    private final BlockRepository blockRepository;
    private final InboxFeatureService inboxFeatureService;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final ActivityService activityService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;
    private final DiscordNotificationService discordNotificationService;
    private final WebSocketEventService webSocketEventService;

    public ChecklistResponse.ListResponse getChecklist(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        List<ChecklistItem> items = checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId);
        return ChecklistResponse.ListResponse.of(items);
    }

    @Transactional
    public ChecklistResponse.Detail createChecklistItem(String boardId, String taskId, String userId, ChecklistRequest.Create request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        User assignee = null;
        BoardContractor contractor = null;
        if (request.getAssigneeId() != null) {
            assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        } else if (request.getContractorId() != null) {
            contractor = contractorRepository.findByIdAndBoardId(request.getContractorId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        }

        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(taskId);
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        ChecklistItem item = ChecklistItem.builder()
                .id(UUID.randomUUID().toString())
                .task(task)
                .title(request.getTitle())
                .assignee(assignee)
                .contractor(contractor)
                .startDate(request.getStartDate())
                .dueDate(request.getDueDate())
                .position(newPosition)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();

        checklistItemRepository.save(item);

        // 활동 로그 기록
        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(
                task.getBoard(),
                creator,
                ActivityAction.CHECKLIST_CREATED,
                TargetType.CHECKLIST,
                item.getId(),
                Map.of(
                        "checklistTitle", item.getTitle(),
                        "taskTitle", task.getTitle(),
                        "taskId", task.getId()
                )
        );

        log.info("Checklist item created: {} in task: {} by user: {}", item.getId(), taskId, userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_CREATED, userId, creator.getName(),
                Map.of("task_id", taskId, "item", response));

        // 알림 발송: 트랜잭션 커밋 후 실행 (알림 실패가 체크리스트 생성을 롤백하지 않도록)
        if (assignee != null) {
            final ChecklistItem savedItem = item;
            final User savedCreator = creator;
            final Board savedBoard = task.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createChecklistAssignedNotification(savedItem, savedCreator, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create checklist assigned notification for item: {}", savedItem.getId(), e);
                    }
                    slackNotificationService.sendChecklistAssignedNotification(savedItem, savedCreator, savedBoard, originUrl);
                    discordNotificationService.sendChecklistAssignedNotification(savedItem, savedCreator, savedBoard, originUrl);
                }
            });
        } else if (contractor != null) {
            final ChecklistItem savedItem = item;
            final User savedCreator = creator;
            final Board savedBoard = task.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createContractorChecklistAssignedNotification(savedItem, savedCreator, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create contractor notification for item: {}", savedItem.getId(), e);
                    }
                }
            });
        }

        return response;
    }

    @Transactional
    public ChecklistResponse.Detail updateChecklistItem(String boardId, String taskId, String itemId, String userId, ChecklistRequest.Update request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        String oldAssigneeId = item.getAssignee() != null ? item.getAssignee().getId() : null;
        String oldContractorId = item.getContractor() != null ? item.getContractor().getId() : null;

        item.updateInfo(request.getTitle(), request.getStartDate(), request.getDueDate());

        // assignee 와 contractor 는 mutually exclusive — assignee 우선
        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            item.updateAssignee(assignee);

            if (!request.getAssigneeId().equals(oldAssigneeId)) {
                User assigner = userRepository.findById(userId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
                final ChecklistItem savedItem = item;
                final User savedAssigner = assigner;
                final Board savedBoard = task.getBoard();
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            notificationService.createChecklistAssignedNotification(savedItem, savedAssigner, savedBoard);
                        } catch (Exception e) {
                            log.warn("Failed to create checklist assigned notification for item: {}", savedItem.getId(), e);
                        }
                        slackNotificationService.sendChecklistAssignedNotification(savedItem, savedAssigner, savedBoard, originUrl);
                        discordNotificationService.sendChecklistAssignedNotification(savedItem, savedAssigner, savedBoard, originUrl);
                    }
                });
            }
        } else if (request.getContractorId() != null) {
            BoardContractor contractor = contractorRepository.findByIdAndBoardId(request.getContractorId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
            item.updateContractor(contractor);

            if (!request.getContractorId().equals(oldContractorId)) {
                User assigner = userRepository.findById(userId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
                final ChecklistItem savedItem = item;
                final User savedAssigner = assigner;
                final Board savedBoard = task.getBoard();
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            notificationService.createContractorChecklistAssignedNotification(savedItem, savedAssigner, savedBoard);
                        } catch (Exception e) {
                            log.warn("Failed to create contractor notification for item: {}", savedItem.getId(), e);
                        }
                    }
                });
            }
        } else {
            // 둘 다 null → 담당자 해제
            if (oldAssigneeId != null) item.updateAssignee(null);
            if (oldContractorId != null) item.updateContractor(null);
        }

        log.info("Checklist item updated: {} by user: {}", itemId, userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_UPDATED, userId, user.getName(),
                Map.of("task_id", taskId, "item", response));
        return response;
    }

    /**
     * 부분 업데이트(PATCH): 요청에 포함된 필드만 갱신한다.
     * <p>
     * - 필드 미전송 → 기존 값 보존
     * - 필드 명시적 null → 해당 필드 클리어 (담당자 해제, 일정 삭제 등)
     * <p>
     * 동시에 담당자 + 일정을 부분 갱신할 때 한쪽이 사라지는 버그를 방지하기 위해 도입.
     */
    @Transactional
    public ChecklistResponse.Detail patchChecklistItem(String boardId, String taskId, String itemId, String userId, ChecklistRequest.Patch request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        String oldAssigneeId = item.getAssignee() != null ? item.getAssignee().getId() : null;
        String oldContractorId = item.getContractor() != null ? item.getContractor().getId() : null;

        if (request.hasTitle() && request.getTitle() != null) {
            item.updateTitle(request.getTitle());
        }
        if (request.hasStartDate()) {
            item.updateStartDate(request.getStartDate());
        }
        if (request.hasDueDate()) {
            item.updateDueDate(request.getDueDate());
        }

        boolean assigneeNewlyAssigned = false;
        if (request.hasAssigneeId()) {
            String newAssigneeId = request.getAssigneeId();
            if (newAssigneeId != null) {
                User assignee = userRepository.findById(newAssigneeId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
                item.updateAssignee(assignee);
                assigneeNewlyAssigned = !newAssigneeId.equals(oldAssigneeId);
            } else if (oldAssigneeId != null) {
                item.updateAssignee(null);
            }
        }

        boolean contractorNewlyAssigned = false;
        if (request.hasContractorId()) {
            String newContractorId = request.getContractorId();
            if (newContractorId != null) {
                BoardContractor contractor = contractorRepository.findByIdAndBoardId(newContractorId, boardId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
                item.updateContractor(contractor);
                contractorNewlyAssigned = !newContractorId.equals(oldContractorId);
            } else if (oldContractorId != null) {
                item.updateContractor(null);
            }
        }

        if (assigneeNewlyAssigned) {
            User assigner = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            final ChecklistItem savedItem = item;
            final User savedAssigner = assigner;
            final Board savedBoard = task.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createChecklistAssignedNotification(savedItem, savedAssigner, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create checklist assigned notification for item: {}", savedItem.getId(), e);
                    }
                    slackNotificationService.sendChecklistAssignedNotification(savedItem, savedAssigner, savedBoard, originUrl);
                    discordNotificationService.sendChecklistAssignedNotification(savedItem, savedAssigner, savedBoard, originUrl);
                }
            });
        } else if (contractorNewlyAssigned) {
            User assigner = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            final ChecklistItem savedItem = item;
            final User savedAssigner = assigner;
            final Board savedBoard = task.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createContractorChecklistAssignedNotification(savedItem, savedAssigner, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create contractor notification for item: {}", savedItem.getId(), e);
                    }
                }
            });
        }

        log.info("Checklist item patched: {} by user: {}", itemId, userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_UPDATED, userId, user.getName(),
                Map.of("task_id", taskId, "item", response));
        return response;
    }

    /**
     * 소프트 삭제: deleted_at 마킹만 함. 자식 데이터 없음.
     * 영구삭제(스케줄 블록 unlink 등)는 hardDeleteChecklistItem에서 처리.
     */
    @Transactional
    public void deleteChecklistItem(String boardId, String taskId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), user, ActivityAction.CHECKLIST_DELETED, TargetType.CHECKLIST, itemId,
                Map.of("checklistTitle", item.getTitle(), "taskTitle", task.getTitle(), "taskId", task.getId()));

        item.softDelete(userId, LocalDateTime.now(ZoneOffset.UTC));

        log.info("Checklist item soft-deleted: {} by user: {}", itemId, userId);

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_DELETED, userId, user.getName(), Map.of("id", itemId, "task_id", taskId));
    }

    /**
     * 영구삭제: 스케줄 블록 / 데일리 체크리스트 연결 해제 후 row 삭제.
     */
    @Transactional
    public void hardDeleteChecklistItem(String boardId, String itemId) {
        ChecklistItem item = checklistItemRepository.findByIdIncludingDeleted(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        // 연관된 데일리 체크리스트 / 스케줄 블록 연결 해제 (타임블럭 업무 기록 보존)
        dailyChecklistRepository.unlinkByChecklistItemId(itemId);
        scheduleBlockRepository.unlinkByChecklistItemId(itemId);

        checklistItemRepository.delete(item);

        log.info("Checklist item hard-deleted: {}", itemId);
    }

    @Transactional
    public ChecklistResponse.Detail toggleChecklistItem(String boardId, String taskId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        item.toggle();
        // 스프린트에 담긴 항목이면 완료 상태에 맞춰 컬럼 동기화 (완료→Done, 미완료→직전 컬럼)
        sprintService.syncColumnOnToggle(item, userId);
        checklistItemRepository.save(item);

        log.info("Checklist item toggled: {} to {} by user: {}", itemId, item.getIsCompleted(), userId);

        // 액티비티 로깅은 별도 트랜잭션으로 실행 (실패해도 토글에 영향 없음)
        try {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            activityService.logActivityInNewTransaction(task.getBoard(), user, ActivityAction.CHECKLIST_CHECKED, TargetType.CHECKLIST, itemId,
                    Map.of("checklistTitle", item.getTitle(), "taskTitle", task.getTitle(), "taskId", task.getId(), "isCompleted", item.getIsCompleted()));
        } catch (Exception e) {
            log.warn("Failed to log checklist toggle activity for item: {}", itemId, e);
        }

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_TOGGLED, userId, user.getName(),
                Map.of("task_id", taskId, "item", response));
        return response;
    }

    @Transactional
    public ChecklistResponse.Detail createChecklistItemFromWorkload(String boardId, String userId, ChecklistRequest.CreateFromWorkload request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task targetTask = resolveTargetTask(boardId, userId, request);

        User assignee = null;
        BoardContractor contractor = null;
        if (request.getAssigneeId() != null) {
            assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        } else if (request.getContractorId() != null) {
            contractor = contractorRepository.findByIdAndBoardId(request.getContractorId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        }

        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(targetTask.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        ChecklistItem item = ChecklistItem.builder()
                .id(java.util.UUID.randomUUID().toString())
                .task(targetTask)
                .title(request.getTitle())
                .assignee(assignee)
                .contractor(contractor)
                .startDate(request.getStartDate())
                .dueDate(request.getDueDate())
                .position(newPosition)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();

        checklistItemRepository.save(item);

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(
                targetTask.getBoard(), creator,
                ActivityAction.CHECKLIST_CREATED, TargetType.CHECKLIST, item.getId(),
                Map.of("checklistTitle", item.getTitle(), "taskTitle", targetTask.getTitle(), "taskId", targetTask.getId()));

        log.info("Checklist item created from workload: {} in task: {} by user: {}", item.getId(), targetTask.getId(), userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_CREATED, userId, creator.getName(),
                Map.of("task_id", targetTask.getId(), "item", response));

        if (assignee != null) {
            final ChecklistItem savedItem = item;
            final User savedCreator = creator;
            final Board savedBoard = targetTask.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createChecklistAssignedNotification(savedItem, savedCreator, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create checklist assigned notification for item: {}", savedItem.getId(), e);
                    }
                    slackNotificationService.sendChecklistAssignedNotification(savedItem, savedCreator, savedBoard, originUrl);
                    discordNotificationService.sendChecklistAssignedNotification(savedItem, savedCreator, savedBoard, originUrl);
                }
            });
        } else if (contractor != null) {
            final ChecklistItem savedItem = item;
            final User savedCreator = creator;
            final Board savedBoard = targetTask.getBoard();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        notificationService.createContractorChecklistAssignedNotification(savedItem, savedCreator, savedBoard);
                    } catch (Exception e) {
                        log.warn("Failed to create contractor notification for item: {}", savedItem.getId(), e);
                    }
                }
            });
        }

        return response;
    }

    private Task resolveTargetTask(String boardId, String userId, ChecklistRequest.CreateFromWorkload request) {
        if (request.getTaskId() != null) {
            Task task = taskRepository.findById(request.getTaskId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
            if (!task.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
            }
            return task;
        }

        Feature feature;
        if (request.getFeatureId() != null) {
            feature = featureRepository.findById(request.getFeatureId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
            if (!feature.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
            }
        } else if (request.getNewFeatureTitle() != null && !request.getNewFeatureTitle().isBlank()) {
            feature = createInlineFeature(boardId, userId, request.getNewFeatureTitle());
        } else {
            return inboxFeatureService.getOrCreateInboxTask(boardId, userId);
        }

        return createInlineTask(boardId, userId, feature, request.getTitle());
    }

    private Feature createInlineFeature(String boardId, String userId, String title) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Integer maxPos = featureRepository.findMaxPositionByBoardId(boardId);
        int newPos = (maxPos != null) ? maxPos + 1 : 0;

        Feature feature = Feature.builder()
                .board(board)
                .title(title)
                .color("#6366F1")
                .position(newPos)
                .createdBy(creator)
                .build();
        featureRepository.save(feature);

        return feature;
    }

    private Task createInlineTask(String boardId, String userId, Feature feature, String title) {
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        Integer maxPosition = taskRepository.findMaxPositionByBlockId(taskBlock.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Task task = Task.builder()
                .feature(feature)
                .board(feature.getBoard())
                .block(taskBlock)
                .title(title)
                .position(newPosition)
                .createdBy(creator)
                .build();
        taskRepository.save(task);

        feature.incrementTotalTasks();

        return task;
    }

    @Transactional
    public ChecklistResponse.Detail moveChecklistItemToTask(String boardId, String taskId, String itemId, String userId, ChecklistRequest.MoveTask request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task sourceTask = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!sourceTask.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        Task targetTask = taskRepository.findById(request.getTargetTaskId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!targetTask.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        // 같은 Task로의 이동은 무시
        if (sourceTask.getId().equals(targetTask.getId())) {
            return ChecklistResponse.Detail.of(item);
        }

        // 대상 Task에서 마지막 position 계산
        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(targetTask.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        item.moveToTask(targetTask, newPosition);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(sourceTask.getBoard(), user, ActivityAction.CHECKLIST_MOVED, TargetType.CHECKLIST, item.getId(),
                Map.of("checklistTitle", item.getTitle(),
                        "fromTask", sourceTask.getTitle(),
                        "toTask", targetTask.getTitle(),
                        "taskId", targetTask.getId()));

        log.info("Checklist item moved: {} from task {} to task {} by user: {}",
                itemId, taskId, targetTask.getId(), userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(item);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_MOVED, userId, user.getName(),
                Map.of("item", response,
                        "source_task_id", taskId,
                        "target_task_id", targetTask.getId()));

        return response;
    }

    @Transactional
    public void reorderChecklistItems(String boardId, String taskId, String userId, ChecklistRequest.Reorder request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        List<String> itemIds = request.getItemIds();
        List<ChecklistItem> items = checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId);

        // 유효성 검사: 모든 아이템이 해당 Task에 속하는지 확인
        java.util.Set<String> taskItemIds = items.stream()
                .map(ChecklistItem::getId)
                .collect(java.util.stream.Collectors.toSet());

        for (String itemId : itemIds) {
            if (!taskItemIds.contains(itemId)) {
                throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
            }
        }

        // position 업데이트
        java.util.Map<String, ChecklistItem> itemMap = items.stream()
                .collect(java.util.stream.Collectors.toMap(ChecklistItem::getId, item -> item));

        for (int i = 0; i < itemIds.size(); i++) {
            ChecklistItem item = itemMap.get(itemIds.get(i));
            if (item != null) {
                item.updatePosition(i);
            }
        }

        log.info("Checklist items reordered in task: {} by user: {}", taskId, userId);
    }

    /**
     * 체크리스트 병합.
     * <p>
     * 실수로 여러 항목으로 쪼개져 각자 타임블록을 물고 있는 경우, 대표 항목(target)으로 통합한다.
     * - 소스 항목들의 타임블록(schedule_blocks)을 대표 항목으로 재지정 (블록별 담당자는 그대로 유지)
     * - 대표 항목의 제목/기간을 반영 (기간 미지정 시 전체 날짜·타임블록 범위로 자동 확장)
     * - 소스 항목은 소프트 삭제
     * <p>
     * 웹소켓은 신규 이벤트 없이 기존 CHECKLIST_DELETED(소스) + CHECKLIST_UPDATED(대표)를 재사용한다.
     */
    @Transactional
    public ChecklistResponse.Detail mergeChecklistItems(String boardId, String taskId, String userId, ChecklistRequest.Merge request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        String targetId = request.getTargetId();

        // 소스 = 요청 목록에서 대표/중복/null 제거
        List<String> sourceIds = request.getSourceIds().stream()
                .filter(id -> id != null && !id.equals(targetId))
                .distinct()
                .toList();
        if (sourceIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        ChecklistItem target = checklistItemRepository.findById(targetId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        if (!target.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        List<ChecklistItem> sources = checklistItemRepository.findAllById(sourceIds);
        if (sources.size() != sourceIds.size()) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }
        for (ChecklistItem s : sources) {
            if (!s.getTask().getId().equals(taskId)) {
                throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
            }
        }

        // 통합 기간 자동 계산: 대표+소스 항목의 start/due + 소속 타임블록 날짜의 min/max
        List<String> allIds = new java.util.ArrayList<>(sourceIds);
        allIds.add(targetId);
        List<ScheduleBlock> allBlocks = scheduleBlockRepository.findByChecklistItemIdIn(allIds);

        LocalDate computedStart = null;
        LocalDate computedDue = null;
        for (ChecklistItem it : sources) {
            computedStart = minDate(computedStart, it.getStartDate());
            computedDue = maxDate(computedDue, it.getDueDate());
        }
        computedStart = minDate(computedStart, target.getStartDate());
        computedDue = maxDate(computedDue, target.getDueDate());
        for (ScheduleBlock b : allBlocks) {
            computedStart = minDate(computedStart, b.getScheduledDate());
            computedDue = maxDate(computedDue, b.getScheduledDate());
        }

        // 타임블록 재지정: sources → target
        scheduleBlockRepository.relinkChecklistItemBlocks(target, sourceIds);

        // 대표 항목 필드 반영
        if (request.getTitle() != null && !request.getTitle().isBlank()) {
            target.updateTitle(request.getTitle());
        }
        LocalDate finalStart = request.getStartDate() != null ? request.getStartDate() : computedStart;
        LocalDate finalDue = request.getDueDate() != null ? request.getDueDate() : computedDue;
        if (finalStart != null) target.updateStartDate(finalStart);
        if (finalDue != null) target.updateDueDate(finalDue);

        // 소스 소프트 삭제 + 활동 로그
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        for (ChecklistItem s : sources) {
            s.softDelete(userId, now);
            activityService.logActivity(task.getBoard(), user, ActivityAction.CHECKLIST_DELETED, TargetType.CHECKLIST, s.getId(),
                    Map.of("checklistTitle", s.getTitle(), "taskTitle", task.getTitle(), "taskId", task.getId()));
        }

        log.info("Merged {} checklist items into {} (task {}) by user {}", sourceIds.size(), targetId, taskId, userId);

        ChecklistResponse.Detail response = ChecklistResponse.Detail.of(target);

        // 웹소켓: 소스 삭제 + 대표 업데이트 (기존 핸들러 재사용)
        for (String sid : sourceIds) {
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_DELETED, userId, user.getName(),
                    Map.of("id", sid, "task_id", taskId));
        }
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_UPDATED, userId, user.getName(),
                Map.of("task_id", taskId, "item", response));

        return response;
    }

    private static LocalDate minDate(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isBefore(b) ? a : b;
    }

    private static LocalDate maxDate(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isAfter(b) ? a : b;
    }

    public ChecklistResponse.BoardListResponse getBoardChecklistItems(String boardId, String userId, String assigneeId, Boolean isScheduled) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<ChecklistItem> items;

        if (isScheduled != null && !isScheduled) {
            if (assigneeId != null) {
                items = checklistItemRepository.findUnscheduledByBoardIdAndAssigneeId(boardId, assigneeId);
            } else {
                items = checklistItemRepository.findUnscheduledByBoardId(boardId);
            }
        } else {
            if (assigneeId != null) {
                items = checklistItemRepository.findByBoardIdAndAssigneeId(boardId, assigneeId);
            } else {
                items = checklistItemRepository.findByBoardId(boardId);
            }
        }

        return ChecklistResponse.BoardListResponse.of(items);
    }

    /**
     * 보드 전체에서 기간 내(completedAt) 완료된 체크리스트 항목 조회 — 팀 주간 리포트용.
     * - boardId 기준 권한 검증 (Viewer 이상)
     * - start_date~end_date(포함) 사이에 완료된 항목만, 담당자·태스크·피처 컨텍스트와 함께 반환
     */
    public ChecklistResponse.BoardListResponse getCompletedChecklistItems(
            String boardId, String userId, LocalDate startDate, LocalDate endDate) {
        boardService.checkViewerOrAbove(boardId, userId);

        LocalDateTime start = startDate.atStartOfDay();
        LocalDateTime end = endDate.plusDays(1).atStartOfDay(); // end_date 당일 포함(반열림 구간)

        List<ChecklistItem> items = checklistItemRepository.findCompletedByBoardIdAndDateRange(
                boardId, start, end);

        return ChecklistResponse.BoardListResponse.of(items);
    }

    /**
     * 담당자별 체크리스트 조회 (캘린더/리소스 뷰용)
     * - boardId 기준 권한 검증 (Viewer 이상)
     * - startDate, endDate 범위로 필터링 (null이면 전체 조회)
     * - 결과를 담당자별 그룹으로 묶어 반환 (미배정 항목은 unassigned로 분리)
     */
    public ChecklistResponse.ByAssigneeResponse getChecklistItemsByAssignee(
            String boardId, String userId, LocalDate startDate, LocalDate endDate) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<ChecklistItem> items = checklistItemRepository.findByBoardIdAndDateRange(
                boardId, startDate, endDate);

        // 보드 멤버 → 직군 매핑 (assignee.id → JobRoleInfo)
        Map<String, JobRoleResponse.JobRoleInfo> jobRoleByUserId = new java.util.HashMap<>();
        for (BoardMember m : boardMemberRepository.findByBoardId(boardId)) {
            if (m.getJobRole() != null) {
                jobRoleByUserId.put(m.getUser().getId(),
                        JobRoleResponse.JobRoleInfo.of(m.getJobRole()));
            }
        }

        return ChecklistResponse.ByAssigneeResponse.of(items, jobRoleByUserId);
    }

    /**
     * 여러 Task의 체크리스트를 일괄 조회
     * IN 쿼리를 사용하여 N+1 문제 방지
     */
    public ChecklistBatchResponse getBatchChecklists(String boardId, String userId, ChecklistBatchRequest request) {
        boardService.checkViewerOrAbove(boardId, userId);

        if (request.getTaskIds() == null || request.getTaskIds().isEmpty()) {
            return ChecklistBatchResponse.builder()
                    .checklists(List.of())
                    .build();
        }

        // IN 쿼리로 한 번에 조회 (N+1 방지)
        List<ChecklistItem> items = checklistItemRepository.findByTaskIdIn(request.getTaskIds());

        // 해당 보드에 속한 체크리스트만 필터링
        List<ChecklistItem> filteredItems = items.stream()
                .filter(item -> item.getTask().getBoard().getId().equals(boardId))
                .toList();

        return ChecklistBatchResponse.of(filteredItems);
    }
}
