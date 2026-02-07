package com.kanban.domain.standup.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.standup.DailyStandupConfig;
import com.kanban.domain.standup.DailyStandupConfigRepository;
import com.kanban.domain.standup.dto.StandupConfigRequest;
import com.kanban.domain.standup.dto.StandupConfigResponse;
import com.kanban.domain.task.Task;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailyStandupService {

    private final DailyStandupConfigRepository configRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final BoardMemberRepository boardMemberRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final CommentRepository commentRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final ObjectMapper objectMapper;

    private static final int MAX_COMMENTS = 50;
    private static final int MAX_COMMENT_LENGTH = 150;

    public StandupConfigResponse.Detail getConfig(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return configRepository.findByBoardId(boardId)
                .map(StandupConfigResponse.Detail::from)
                .orElse(null);
    }

    @Transactional
    public StandupConfigResponse.Detail upsertConfig(String boardId, String userId,
                                                      StandupConfigRequest.Upsert request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.canAccessSlack()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }

        // Validate timezone
        try {
            ZoneId.of(request.getTimezone());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // Convert admin's local time to UTC
        ZoneId adminZone = ZoneId.of(request.getTimezone());
        LocalTime localTime = LocalTime.of(request.getSendHour(), request.getSendMinute());
        ZonedDateTime localZoned = ZonedDateTime.of(LocalDate.now(), localTime, adminZone);
        ZonedDateTime utcZoned = localZoned.withZoneSameInstant(ZoneOffset.UTC);
        int utcHour = utcZoned.getHour();
        int utcMinute = utcZoned.getMinute();

        DailyStandupConfig config = configRepository.findByBoardId(boardId).orElse(null);
        String lang = request.getLanguage() != null ? request.getLanguage() : "ko";

        if (config != null) {
            config.update(request.getEnabled(), utcHour, utcMinute,
                    request.getTimezone(), lang);
        } else {
            config = DailyStandupConfig.builder()
                    .board(board)
                    .enabled(request.getEnabled())
                    .sendHourUtc(utcHour)
                    .sendMinuteUtc(utcMinute)
                    .timezone(request.getTimezone())
                    .language(lang)
                    .build();
        }

        configRepository.save(config);
        log.info("Standup config updated for board: {}, enabled: {}, UTC {}:{}",
                boardId, request.getEnabled(), utcHour, utcMinute);

        return StandupConfigResponse.Detail.from(config);
    }

    /**
     * 보드 전체의 어제 활동 데이터를 수집하여 JSON으로 반환
     */
    public String gatherBoardWideStandupData(DailyStandupConfig config) {
        String boardId = config.getBoard().getId();
        ZoneId boardZone = ZoneId.of(config.getTimezone());

        // "어제" 경계를 보드 타임존 기준으로 계산
        ZonedDateTime nowInBoardZone = ZonedDateTime.now(boardZone);
        LocalDate yesterday = nowInBoardZone.toLocalDate().minusDays(1);
        ZonedDateTime dayStart = yesterday.atStartOfDay(boardZone);
        ZonedDateTime dayEnd = yesterday.plusDays(1).atStartOfDay(boardZone);

        LocalDateTime utcStart = dayStart.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime utcEnd = dayEnd.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("board_name", config.getBoard().getName());
        data.put("date", yesterday.toString());

        // 1. 어제의 ScheduleBlocks
        List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository
                .findByBoardIdAndScheduledDateBetween(boardId, yesterday, yesterday);

        // 2. 어제의 Comments
        List<Comment> comments = commentRepository.findByBoardAndDateRange(
                boardId, utcStart, utcEnd);

        // 3. 팀 크기
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        data.put("team_size", members.size());

        // Task별 시간 블록 그룹핑
        Map<String, List<ScheduleBlock>> blocksByTask = scheduleBlocks.stream()
                .filter(sb -> sb.getChecklistItem() != null)
                .collect(Collectors.groupingBy(
                        sb -> sb.getChecklistItem().getTask().getId()));

        // Task별 댓글 그룹핑
        Map<String, List<Comment>> commentsByTask = comments.stream()
                .filter(c -> c.getTask() != null)
                .collect(Collectors.groupingBy(c -> c.getTask().getId()));

        // 활동이 있는 Task ID 수집
        Set<String> activeTaskIds = new HashSet<>();
        activeTaskIds.addAll(blocksByTask.keySet());
        activeTaskIds.addAll(commentsByTask.keySet());

        // 활동이 없으면 null 반환 (AI API 호출 불필요)
        if (activeTaskIds.isEmpty() && comments.isEmpty()) {
            return null;
        }

        // Feature → Task 그룹핑
        Map<String, List<Map<String, Object>>> featureTasksMap = new LinkedHashMap<>();
        Map<String, Feature> featureMap = new LinkedHashMap<>();
        int totalMinutes = 0;

        for (String taskId : activeTaskIds) {
            List<ScheduleBlock> taskBlocks = blocksByTask.getOrDefault(taskId, Collections.emptyList());
            List<Comment> taskComments = commentsByTask.getOrDefault(taskId, Collections.emptyList());

            Task task = null;
            if (!taskBlocks.isEmpty()) {
                task = taskBlocks.get(0).getChecklistItem().getTask();
            } else if (!taskComments.isEmpty()) {
                task = taskComments.get(0).getTask();
            }
            if (task == null) continue;

            Feature feature = task.getFeature();
            if (feature == null) continue;
            String featureId = feature.getId();
            featureMap.putIfAbsent(featureId, feature);

            // Task 시간 계산
            int taskMinutes = taskBlocks.stream()
                    .mapToInt(sb -> (int) Duration.between(sb.getStartTime(), sb.getEndTime()).toMinutes())
                    .sum();
            totalMinutes += taskMinutes;

            Map<String, Object> taskData = new LinkedHashMap<>();
            taskData.put("title", task.getTitle());
            taskData.put("block", task.getBlock() != null ? task.getBlock().getName() : "Unknown");
            taskData.put("completed", task.getIsCompleted());

            // 멤버별 시간 투입
            if (taskMinutes > 0) {
                taskData.put("time_minutes", taskMinutes);
                Map<String, Integer> byMember = taskBlocks.stream()
                        .filter(sb -> sb.getAssignee() != null)
                        .collect(Collectors.groupingBy(
                                sb -> sb.getAssignee().getName(),
                                Collectors.summingInt(sb ->
                                        (int) Duration.between(sb.getStartTime(), sb.getEndTime()).toMinutes())));
                taskData.put("time_by_member", byMember);
            }

            // 체크리스트 현황 (해당 태스크에 연결된 항목)
            if (!taskBlocks.isEmpty()) {
                Set<String> checklistIds = taskBlocks.stream()
                        .map(sb -> sb.getChecklistItem().getId())
                        .collect(Collectors.toSet());
                List<Map<String, Object>> clList = taskBlocks.stream()
                        .map(ScheduleBlock::getChecklistItem)
                        .filter(ci -> checklistIds.remove(ci.getId()))
                        .map(ci -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("title", ci.getTitle());
                            m.put("completed", ci.getIsCompleted());
                            return m;
                        }).toList();
                if (!clList.isEmpty()) {
                    taskData.put("checklists", clList);
                }
            }

            // 댓글
            if (!taskComments.isEmpty()) {
                List<Map<String, String>> cmList = taskComments.stream()
                        .limit(5)
                        .map(c -> {
                            Map<String, String> m = new LinkedHashMap<>();
                            m.put("author", c.getAuthor() != null ? c.getAuthor().getName() : "Unknown");
                            String content = c.getContent();
                            if (content != null && content.length() > MAX_COMMENT_LENGTH) {
                                content = content.substring(0, MAX_COMMENT_LENGTH) + "...";
                            }
                            m.put("content", content != null ? content : "");
                            return m;
                        }).toList();
                taskData.put("comments", cmList);
            }

            featureTasksMap.computeIfAbsent(featureId, k -> new ArrayList<>()).add(taskData);
        }

        // Feature 단위로 조합
        List<Map<String, Object>> featureList = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : featureTasksMap.entrySet()) {
            Feature f = featureMap.get(entry.getKey());
            if (f == null) continue;
            Map<String, Object> fd = new LinkedHashMap<>();
            fd.put("title", f.getTitle());
            fd.put("status", f.getStatus().name());
            fd.put("progress", f.getCompletedTasks() + "/" + f.getTotalTasks());
            fd.put("tasks", entry.getValue());
            featureList.add(fd);
        }

        data.put("features", featureList);
        data.put("total_time_minutes", totalMinutes);
        data.put("total_comments", Math.min(comments.size(), MAX_COMMENTS));

        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize standup data: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }
    }
}
