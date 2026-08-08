package com.kanban.domain.personal.service;

import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.schedule.dto.ScheduleRequest;
import com.kanban.domain.schedule.dto.ScheduleResponse;
import com.kanban.domain.schedule.service.ScheduleService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalTaskService {

    /** 타임블록 제목 컬럼(schedule_blocks.title)이 100자라 백로그 제목(200자)을 잘라 넣는다 */
    private static final int TIMEBLOCK_TITLE_MAX = 100;

    private final PersonalTaskRepository personalTaskRepository;
    private final UserRepository userRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final TaskService taskService;
    private final ChecklistService checklistService;
    private final ScheduleService scheduleService;
    private final TaskRepository taskRepository;

    // ─── Task CRUD ───

    public List<PersonalTaskResponse.Detail> getTasks(String userId) {
        return personalTaskRepository.findByUserIdWithDetails(userId).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();
    }

    /**
     * 보드 대시보드 백로그 목록.
     *
     * <p>승격된 항목은 여기 없다 — 승격은 ARCHIVED로 닫고, 조회가 ARCHIVED를 걸러낸다.
     */
    public List<PersonalTaskResponse.Detail> getBacklog(String userId, String boardId) {
        return toBacklogDetails(userId, boardId);
    }

    /**
     * 같은 보드에 있는 다른 멤버의 백로그 목록 (읽기 전용).
     *
     * <p>대시보드는 스코프를 바꿔 남의 워크로드·배치 대기를 읽을 수 있는데 백로그만
     * 빈칸이었다. "이 사람이 무엇을 적어 뒀나"는 배치를 상의하는 데 필요한 정보라 열어 준다.
     *
     * <p>여는 범위는 <b>이 보드의</b> 백로그뿐이다 — 조회가 board_id로 걸려 있어
     * 마이스페이스의 개인 할 일(board_id 없음)은 어떤 경우에도 여기 들어오지 않는다.
     * 요청자와 대상 둘 다 이 보드의 멤버여야 한다.
     */
    public List<PersonalTaskResponse.Detail> getMemberBacklog(String requesterId, String boardId, String targetUserId) {
        if (requesterId.equals(targetUserId)) {
            return toBacklogDetails(requesterId, boardId);
        }
        if (!boardMemberRepository.existsByBoardIdAndUserId(boardId, requesterId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }
        if (!boardMemberRepository.existsByBoardIdAndUserId(boardId, targetUserId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        return toBacklogDetails(targetUserId, boardId);
    }

    private List<PersonalTaskResponse.Detail> toBacklogDetails(String userId, String boardId) {
        return personalTaskRepository.findBacklogByUserIdAndBoardId(userId, boardId).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();
    }

    public List<PersonalTaskResponse.Detail> getTasksByStatus(String userId, PersonalTaskStatus status) {
        return personalTaskRepository.findByUserIdAndStatus(userId, status).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();
    }

    public PersonalTaskResponse.Detail getTask(String userId, String taskId) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public PersonalTaskResponse.Detail createTask(String userId, PersonalTaskRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 백로그(보드에서 적은 것)는 "아직 아무것도 아닌 일"이라 마감일을 임의로 채우지 않는다.
        // 마이스페이스 경로(boardId 없음)는 기존대로 오늘로 채운다.
        boolean isBacklog = request.getBoardId() != null && !request.getBoardId().isBlank();
        LocalDate dueDate = request.getDueDate() != null
                ? request.getDueDate()
                : (isBacklog ? null : LocalDate.now(ZoneOffset.UTC));

        PersonalTask task = PersonalTask.builder()
                .user(user)
                .title(request.getTitle())
                .description(request.getDescription())
                .priority(request.getPriority() != null ? request.getPriority() : PersonalTaskPriority.MEDIUM)
                .dueDate(dueDate)
                .category(request.getCategory())
                .color(request.getColor())
                .boardId(isBacklog ? request.getBoardId() : null)
                // 새 항목이 맨 앞에 오도록 최솟값보다 하나 작게 — 전체 재정렬을 피한다
                .position(isBacklog
                        ? nextBacklogPosition(userId, request.getBoardId())
                        : 0)
                .build();

        personalTaskRepository.save(task);
        return PersonalTaskResponse.Detail.of(task);
    }

    private int nextBacklogPosition(String userId, String boardId) {
        Integer min = personalTaskRepository.findMinPositionByUserIdAndBoardId(userId, boardId);
        return (min != null ? min : 0) - 1;
    }

    @Transactional
    public PersonalTaskResponse.Detail updateTask(String userId, String taskId, PersonalTaskRequest.Update request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        task.update(request.getTitle(), request.getDescription(), request.getPriority(),
                request.getDueDate(), request.getCategory(), request.getColor());
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public PersonalTaskResponse.Detail updateTaskStatus(String userId, String taskId, PersonalTaskRequest.StatusUpdate request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        task.updateStatus(request.getStatus());
        return PersonalTaskResponse.Detail.of(task);
    }

    @Transactional
    public void updateTaskPosition(String userId, String taskId, PersonalTaskRequest.PositionUpdate request) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        if (request.getStatus() != null) {
            task.updateStatus(request.getStatus());
        }
        task.updatePosition(request.getPosition());
    }

    @Transactional
    public void deleteTask(String userId, String taskId) {
        PersonalTask task = findTaskAndVerifyOwner(userId, taskId);
        personalTaskRepository.delete(task);
    }

    public List<String> getCategories(String userId) {
        return personalTaskRepository.findDistinctCategoriesByUserId(userId);
    }

    // ─── 백로그 승격 ───

    /**
     * 백로그 항목을 타임블록 · 태스크 · 체크리스트 항목으로 승격시킨다.
     *
     * <p>실제 생성은 각 도메인 서비스에 그대로 위임한다 — 태스크 키 발급, 활동 로그,
     * WebSocket 브로드캐스트 같은 부수 처리를 우회하지 않기 위해서다.
     * 보드 권한 검증도 그 서비스들이 이미 하고 있으므로 여기서 다시 하지 않는다.
     */
    @Transactional
    public PersonalTaskResponse.Detail promote(String userId, String taskId,
                                               PersonalTaskRequest.Promote request, String originUrl) {
        PersonalTask backlog = findTaskAndVerifyOwner(userId, taskId);

        if (backlog.getBoardId() == null) {
            // 마이스페이스 전역 항목은 붙일 보드가 없다
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (backlog.getPromotedType() != null) {
            // 이미 승격돼 백로그에서 빠진 항목 — 두 번 승격될 자리가 없다
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        String boardId = backlog.getBoardId();
        String label;

        switch (request.getTarget()) {
            case TIMEBLOCK -> {
                require(request.getScheduledDate() != null
                        && request.getStartTime() != null && request.getEndTime() != null);
                ScheduleResponse.BlockDetail block = scheduleService.createScheduleBlock(
                        boardId, userId,
                        ScheduleRequest.Create.custom(
                                truncate(backlog.getTitle(), TIMEBLOCK_TITLE_MAX),
                                userId,
                                request.getScheduledDate(),
                                request.getStartTime(),
                                request.getEndTime()));
                backlog.promote(PersonalTaskPromotionType.TIMEBLOCK, block.getId());
                label = request.getStartTime().toString();
            }
            case TASK -> {
                require(request.getFeatureId() != null && !request.getFeatureId().isBlank());
                TaskResponse.Detail created = taskService.createTask(
                        boardId, request.getFeatureId(), userId,
                        TaskRequest.Create.of(backlog.getTitle(),
                                request.getStartDate(), request.getDueDate()));
                backlog.promote(PersonalTaskPromotionType.TASK, created.getId());
                label = resolveTaskLabel(created.getId());
            }
            case CHECKLIST_ITEM -> {
                require(request.getTaskId() != null && !request.getTaskId().isBlank());
                ChecklistResponse.Detail created = checklistService.createChecklistItem(
                        boardId, request.getTaskId(), userId,
                        ChecklistRequest.Create.of(backlog.getTitle(), userId),
                        originUrl);
                backlog.promote(PersonalTaskPromotionType.CHECKLIST_ITEM, created.getId());
                label = taskRepository.findById(request.getTaskId())
                        .map(Task::getTitle)
                        .orElse(null);
            }
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        return PersonalTaskResponse.Detail.of(backlog, label);
    }

    /** 태스크 라벨은 제목이 아니라 "어느 블록으로 갔나" — 제목은 백로그 항목과 같아서 정보가 없다 */
    private String resolveTaskLabel(String createdTaskId) {
        return taskRepository.findById(createdTaskId)
                .map(t -> t.getBlock() != null ? t.getBlock().getName()
                        : (t.getFeature() != null ? t.getFeature().getTitle() : null))
                .orElse(null);
    }

    private void require(boolean condition) {
        if (!condition) throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    // ─── Helpers ───

    private PersonalTask findTaskAndVerifyOwner(String userId, String taskId) {
        PersonalTask task = personalTaskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_TASK_NOT_FOUND));
        if (!task.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        return task;
    }
}
