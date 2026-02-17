package com.kanban.domain.schedule.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.schedule.dto.ScheduleResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Schedule + DailyChecklist 통합 Facade 서비스
 * Day 모드에서 2개 API 호출 → 1개로 통합
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScheduleFacadeService {

    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final MeetingRepository meetingRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    /**
     * Day 모드 통합 조회 (스케줄 + 데일리 체크리스트)
     * 기존 2개 API 호출 → 1개로 통합하여 50% 감소
     */
    public ScheduleResponse.DailyFull getDailyFull(String boardId, LocalDate date, List<String> assigneeIds, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateScheduleAccess(board);

        // 대상 담당자 목록
        Map<String, User> userCache = new java.util.HashMap<>();
        List<String> targetAssigneeIds = assigneeIds;
        if (targetAssigneeIds == null || targetAssigneeIds.isEmpty()) {
            var members = boardMemberRepository.findByBoardId(boardId);
            targetAssigneeIds = members.stream().map(bm -> bm.getUser().getId()).collect(Collectors.toList());
            members.forEach(bm -> userCache.put(bm.getUser().getId(), bm.getUser()));
        } else {
            userRepository.findAllById(targetAssigneeIds).forEach(u -> userCache.put(u.getId(), u));
        }

        // 1. 스케줄 블록 조회
        List<ScheduleBlock> blocks = scheduleBlockRepository
                .findByBoardIdAndScheduledDateAndAssigneeIdInOrderByStartTimeAsc(boardId, date, targetAssigneeIds);

        Map<String, List<ScheduleBlock>> blocksByAssignee = blocks.stream()
                .collect(Collectors.groupingBy(b -> b.getAssignee().getId()));

        List<ScheduleResponse.ColumnInfo> scheduleColumns = new ArrayList<>();
        for (String assigneeId : targetAssigneeIds) {
            User user = userCache.get(assigneeId);
            if (user == null) continue;

            List<ScheduleBlock> userBlocks = blocksByAssignee.getOrDefault(assigneeId, new ArrayList<>());
            List<ScheduleResponse.BlockInfo> blockInfos = userBlocks.stream()
                    .map(ScheduleResponse.BlockInfo::of)
                    .collect(Collectors.toList());

            scheduleColumns.add(ScheduleResponse.ColumnInfo.builder()
                    .user(ScheduleResponse.UserInfo.of(user))
                    .blocks(blockInfos)
                    .build());
        }

        // 2. 데일리 체크리스트 조회
        List<DailyChecklist> dailyChecklists = dailyChecklistRepository
                .findByBoardIdAndAssignedDateOrderByPositionAsc(boardId, date);

        Map<String, List<DailyChecklist>> checklistsByAssignee = dailyChecklists.stream()
                .collect(Collectors.groupingBy(dc -> dc.getAssignee().getId()));

        List<ScheduleResponse.DailyChecklistColumnInfo> checklistColumns = new ArrayList<>();
        for (String assigneeId : targetAssigneeIds) {
            User user = userCache.get(assigneeId);
            if (user == null) continue;

            List<DailyChecklist> userChecklists = checklistsByAssignee.getOrDefault(assigneeId, new ArrayList<>());
            List<ScheduleResponse.DailyChecklistItemInfo> itemInfos = userChecklists.stream()
                    .map(this::toDailyChecklistItemInfo)
                    .collect(Collectors.toList());

            checklistColumns.add(ScheduleResponse.DailyChecklistColumnInfo.builder()
                    .user(ScheduleResponse.UserInfo.of(user))
                    .items(itemInfos)
                    .build());
        }

        // 3. 시간이 지정된 회의 조회 (타임블록 오버레이용)
        List<Meeting> meetingsWithTime = meetingRepository.findByBoardIdAndMeetingDateWithTime(boardId, date);
        List<MeetingResponse.Summary> meetingSummaries = meetingsWithTime.stream()
                .map(m -> MeetingResponse.Summary.of(m, 0))
                .toList();

        log.info("Daily full data loaded: {} date {} by user: {}", boardId, date, userId);

        return ScheduleResponse.DailyFull.builder()
                .date(date)
                .settings(ScheduleResponse.SettingsInfo.of(board))
                .columns(scheduleColumns)
                .dailyChecklists(checklistColumns)
                .meetings(meetingSummaries)
                .build();
    }

    private ScheduleResponse.DailyChecklistItemInfo toDailyChecklistItemInfo(DailyChecklist dc) {
        ChecklistItem checklistItem = dc.getChecklistItem();
        Task task = checklistItem != null ? checklistItem.getTask() : null;
        Feature feature = task != null ? task.getFeature() : null;

        return ScheduleResponse.DailyChecklistItemInfo.builder()
                .id(dc.getId())
                .checklistItemId(checklistItem != null ? checklistItem.getId() : null)
                .title(dc.getTitle())
                .assignee(ScheduleResponse.UserInfo.of(dc.getAssignee()))
                .assignedDate(dc.getAssignedDate())
                .position(dc.getPosition())
                .completed(checklistItem != null ? checklistItem.getIsCompleted() : false)
                .task(task != null ? ScheduleResponse.TaskInfo.of(task) : null)
                .feature(feature != null ? ScheduleResponse.FeatureInfo.of(feature) : null)
                .build();
    }

    private void validateScheduleAccess(Board board) {
        board.checkAndUpdateTierIfTrialExpired();
        if (!board.canAccessSchedule()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }
}
