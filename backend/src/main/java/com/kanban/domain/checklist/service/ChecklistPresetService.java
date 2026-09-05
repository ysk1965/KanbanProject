package com.kanban.domain.checklist.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.ChecklistPreset;
import com.kanban.domain.checklist.ChecklistPresetItem;
import com.kanban.domain.checklist.ChecklistPresetRepository;
import com.kanban.domain.checklist.dto.ChecklistPresetRequest;
import com.kanban.domain.checklist.dto.ChecklistPresetResponse;
import com.kanban.domain.checklist.dto.ChecklistResponse;
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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChecklistPresetService {

    /** 프리셋 항목은 255자까지 받지만 checklist_items.title은 200자 컬럼이라 적용 시 잘라 넣는다. */
    private static final int CHECKLIST_TITLE_MAX = 200;

    private final ChecklistPresetRepository presetRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;

    public ChecklistPresetResponse.ListResponse getPresets(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        List<ChecklistPreset> presets = presetRepository.findByBoardIdWithItems(boardId);
        return ChecklistPresetResponse.ListResponse.of(presets);
    }

    @Transactional
    public ChecklistPresetResponse.Detail createPreset(String boardId, String userId, ChecklistPresetRequest.Save request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        ChecklistPreset preset = ChecklistPreset.builder()
                .board(board)
                .name(request.getName())
                .icon(request.getIcon())
                .build();
        preset.replaceItems(itemDrafts(boardId, request));

        presetRepository.save(preset);

        log.info("Checklist preset created: {} in board: {} by user: {}", preset.getId(), boardId, userId);

        return ChecklistPresetResponse.Detail.of(preset);
    }

    @Transactional
    public ChecklistPresetResponse.Detail updatePreset(String boardId, String presetId, String userId, ChecklistPresetRequest.Save request) {
        boardService.checkMemberOrAbove(boardId, userId);

        ChecklistPreset preset = findBoardPreset(boardId, presetId);
        preset.updateInfo(request.getName(), request.getIcon());
        preset.replaceItems(itemDrafts(boardId, request));

        log.info("Checklist preset updated: {} by user: {}", presetId, userId);

        return ChecklistPresetResponse.Detail.of(preset);
    }

    @Transactional
    public void deletePreset(String boardId, String presetId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        ChecklistPreset preset = findBoardPreset(boardId, presetId);

        // 프리셋을 참조하던 태스크의 라벨 정리 (FK 없이 서비스 레이어에서 — 태스크의 체크리스트는 유지)
        int cleared = taskRepository.clearPresetByPresetId(presetId);

        presetRepository.delete(preset);

        log.info("Checklist preset deleted: {} by user: {} ({} task(s) cleared)", presetId, userId, cleared);
    }

    /**
     * 프리셋 항목들을 태스크의 체크리스트로 일괄 생성한다 (ai/apply와 동일한 생성 경로).
     * 같은 제목(trim 비교)이 이미 있으면 건너뛰고, 태스크에 preset_id를 기록한다.
     */
    @Transactional
    public ChecklistPresetResponse.ApplyResult applyPreset(String boardId, String taskId, String userId, ChecklistPresetRequest.Apply request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistPreset preset = findBoardPreset(boardId, request.getPresetId());

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Set<String> existingTitles = new HashSet<>();
        for (ChecklistItem existing : checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId)) {
            existingTitles.add(existing.getTitle().trim());
        }

        Integer maxPos = checklistItemRepository.findMaxPositionByTaskId(taskId);
        int nextPos = (maxPos != null) ? maxPos + 1 : 0;

        // 프리셋에 저장된 담당자 — 현재도 보드 멤버인 유저만 배정한다 (탈퇴/제외된 멤버는 미배정)
        Map<String, User> assignees = resolveAssignees(boardId, preset);

        List<ChecklistResponse.Detail> created = new ArrayList<>();
        int skipped = 0;

        for (ChecklistPresetItem presetItem : preset.getItems()) {
            String title = presetItem.getTitle().trim();
            if (title.length() > CHECKLIST_TITLE_MAX) {
                title = title.substring(0, CHECKLIST_TITLE_MAX);
            }
            if (!existingTitles.add(title)) {
                skipped++;
                continue;
            }

            ChecklistItem checklistItem = ChecklistItem.builder()
                    .task(task)
                    .title(title)
                    .assignee(assignees.get(presetItem.getAssigneeId()))
                    .position(nextPos++)
                    .build();
            checklistItemRepository.save(checklistItem);
            created.add(ChecklistResponse.Detail.of(checklistItem));
        }

        task.assignPreset(preset.getId());

        log.info("Checklist preset {} applied to task: {}. Created: {}, skipped: {}",
                preset.getId(), taskId, created.size(), skipped);

        activityService.logActivity(task.getBoard(), creator,
                ActivityAction.CHECKLIST_CREATED, TargetType.TASK, taskId,
                Map.of("taskTitle", task.getTitle(),
                        "presetName", preset.getName(),
                        "itemsCreated", String.valueOf(created.size())));

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_CREATED,
                userId, creator.getName(), Map.of("taskId", taskId));

        return ChecklistPresetResponse.ApplyResult.builder()
                .createdCount(created.size())
                .skippedDuplicates(skipped)
                .checklists(created)
                .build();
    }

    /** 태스크의 프리셋 라벨만 해제한다 — 체크리스트 항목은 유지. */
    @Transactional
    public void clearPreset(String boardId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        task.assignPreset(null);

        log.info("Checklist preset cleared from task: {} by user: {}", taskId, userId);
    }

    private ChecklistPreset findBoardPreset(String boardId, String presetId) {
        ChecklistPreset preset = presetRepository.findById(presetId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_PRESET_NOT_FOUND));
        if (!preset.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_PRESET_NOT_FOUND);
        }
        return preset;
    }

    /** 요청 항목 → 드래프트. 담당자는 보드 멤버가 아니면 버린다 (미배정 저장). */
    private List<ChecklistPreset.ItemDraft> itemDrafts(String boardId, ChecklistPresetRequest.Save request) {
        Set<String> memberIds = boardMemberIds(boardId);
        return request.getItems().stream()
                .map(i -> new ChecklistPreset.ItemDraft(
                        i.getTitle().trim(),
                        (i.getAssigneeId() != null && memberIds.contains(i.getAssigneeId()))
                                ? i.getAssigneeId() : null))
                .filter(d -> !d.title().isEmpty())
                .toList();
    }

    /** 프리셋 항목의 assigneeId 중 현재 보드 멤버인 유저만 id → User로 매핑 */
    private Map<String, User> resolveAssignees(String boardId, ChecklistPreset preset) {
        Set<String> assigneeIds = preset.getItems().stream()
                .map(ChecklistPresetItem::getAssigneeId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        if (assigneeIds.isEmpty()) {
            return Map.of();
        }
        assigneeIds.retainAll(boardMemberIds(boardId));

        Map<String, User> users = new HashMap<>();
        for (User user : userRepository.findAllById(assigneeIds)) {
            users.put(user.getId(), user);
        }
        return users;
    }

    private Set<String> boardMemberIds(String boardId) {
        return boardMemberRepository.findByBoardId(boardId).stream()
                .map(m -> m.getUser().getId())
                .collect(Collectors.toSet());
    }
}
