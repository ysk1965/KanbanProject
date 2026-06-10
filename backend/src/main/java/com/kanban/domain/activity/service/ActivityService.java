package com.kanban.domain.activity.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.ActivityLog;
import com.kanban.domain.activity.ActivityLogRepository;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.dto.ActivityResponse;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActivityService {

    private final ActivityLogRepository activityLogRepository;
    private final BoardService boardService;

    public ActivityResponse.ListResponse getActivities(String boardId, String userId, LocalDateTime cursor, int limit) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        return getActivitiesInternal(boardId, cursor, limit);
    }

    /** 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용) */
    public ActivityResponse.ListResponse getActivitiesInternal(String boardId, LocalDateTime cursor, int limit) {
        List<ActivityLog> logs;
        if (cursor != null) {
            logs = activityLogRepository.findByBoardIdWithCursor(boardId, cursor, PageRequest.of(0, limit + 1));
        } else {
            logs = activityLogRepository.findByBoardIdOrderByCreatedAtDesc(boardId, PageRequest.of(0, limit + 1)).getContent();
        }

        return ActivityResponse.ListResponse.of(logs, limit);
    }

    public List<ActivityResponse.Detail> getTargetActivities(String boardId, String userId, TargetType targetType, String targetId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<ActivityLog> logs = activityLogRepository.findByTarget(boardId, targetType, targetId);
        return logs.stream().map(ActivityResponse.Detail::of).toList();
    }

    @Transactional
    public void logActivity(Board board, User user, ActivityAction action, TargetType targetType, String targetId, Map<String, Object> metadata) {
        ActivityLog activityLog = ActivityLog.create(board, user, action, targetType, targetId, metadata);
        activityLogRepository.save(activityLog);

        log.info("Activity logged: {} on {} {} by user {}", action, targetType, targetId, user.getId());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logActivityInNewTransaction(Board board, User user, ActivityAction action, TargetType targetType, String targetId, Map<String, Object> metadata) {
        ActivityLog activityLog = ActivityLog.create(board, user, action, targetType, targetId, metadata);
        activityLogRepository.save(activityLog);

        log.info("Activity logged (new tx): {} on {} {} by user {}", action, targetType, targetId, user.getId());
    }
}
