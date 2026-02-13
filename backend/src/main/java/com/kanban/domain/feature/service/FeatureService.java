package com.kanban.domain.feature.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.dto.FeatureRequest;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.tag.FeatureTag;
import com.kanban.domain.tag.FeatureTagRepository;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TaskTagRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FeatureService {

    private final FeatureRepository featureRepository;
    private final FeatureTagRepository featureTagRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final TaskRepository taskRepository;
    private final TaskTagRepository taskTagRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentRepository commentRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final NotificationRepository notificationRepository;
    private final FileUploadService fileUploadService;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;

    @Cacheable(value = "features", key = "#boardId", condition = "#milestoneId == null", unless = "#result == null")
    public FeatureResponse.ListResponse getFeatures(String boardId, String userId, String milestoneId) {
        boardService.checkViewerOrAbove(boardId, userId);

        log.debug("Features loaded from DB for board: {}, milestone: {}", boardId, milestoneId);
        // Fetch Join으로 N+1 방지
        List<Feature> features = featureRepository.findByBoardIdWithFetch(boardId);

        // 마일스톤 필터 적용
        if (milestoneId != null && !milestoneId.isEmpty()) {
            Set<String> milestoneFeatureIds = new HashSet<>(
                    milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId)
            );
            features = features.stream()
                    .filter(f -> milestoneFeatureIds.contains(f.getId()))
                    .collect(Collectors.toList());
        }

        Map<String, List<Tag>> featureTagsMap = getFeatureTagsMap(features);

        return FeatureResponse.ListResponse.of(features, featureTagsMap);
    }

    public FeatureResponse.Detail getFeature(String boardId, String featureId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        List<Tag> tags = featureTagRepository.findByFeatureIdWithFetch(featureId).stream()
                .map(FeatureTag::getTag)
                .toList();

        return FeatureResponse.Detail.of(feature, tags);
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public FeatureResponse.Detail createFeature(String boardId, String userId, FeatureRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        User assignee = null;
        if (request.getAssigneeId() != null) {
            assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        }

        Integer maxPosition = featureRepository.findMaxPositionByBoardId(boardId);
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        Feature feature = Feature.builder()
                .board(board)
                .title(request.getTitle())
                .description(request.getDescription())
                .color(request.getColor())
                .assignee(assignee)
                .dueDate(request.getDueDate())
                .position(newPosition)
                .createdBy(creator)
                .build();

        featureRepository.save(feature);

        activityService.logActivity(board, creator, ActivityAction.FEATURE_CREATED, TargetType.FEATURE, feature.getId(),
                Map.of("featureTitle", feature.getTitle(), "featureColor", feature.getColor()));

        log.info("Feature created: {} in board: {} by user: {}", feature.getId(), boardId, userId);

        FeatureResponse.Detail response = FeatureResponse.Detail.of(feature, List.of());
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_CREATED, userId, creator.getName(), response);
        return response;
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public FeatureResponse.Detail updateFeature(String boardId, String featureId, String userId, FeatureRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        feature.updateInfo(
                request.getTitle(),
                request.getDescription(),
                request.getColor(),
                request.getDueDate()
        );

        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            feature.updateAssignee(assignee);
        }

        User updater = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(feature.getBoard(), updater, ActivityAction.FEATURE_UPDATED, TargetType.FEATURE, featureId,
                Map.of("featureTitle", feature.getTitle()));

        List<Tag> tags = featureTagRepository.findByFeatureIdWithFetch(featureId).stream()
                .map(FeatureTag::getTag)
                .toList();

        log.info("Feature updated: {} by user: {}", featureId, userId);

        FeatureResponse.Detail response = FeatureResponse.Detail.of(feature, tags);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_UPDATED, userId, updater.getName(), response);
        return response;
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void deleteFeature(String boardId, String featureId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        // 활동 로그 기록 (삭제 전에 기록)
        String featureTitle = feature.getTitle();
        User deleter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(feature.getBoard(), deleter, ActivityAction.FEATURE_DELETED, TargetType.FEATURE, featureId,
                Map.of("featureTitle", featureTitle));

        // 관련 데이터 삭제 (FK 의존성 순서: leaf → parent)
        // 1) 마일스톤-피처 연결 삭제
        milestoneFeatureRepository.deleteByFeatureId(featureId);

        // 2) 피처 태그 연결 삭제
        featureTagRepository.deleteByFeatureId(featureId);

        // 3) Task 하위 데이터 벌크 삭제 (feature의 모든 task에 대해)
        // 3-1) 알림 (task_id는 VARCHAR 참조)
        List<String> taskIds = taskRepository.findByFeatureIdOrderByPositionAsc(featureId)
                .stream().map(t -> t.getId()).toList();
        for (String taskId : taskIds) {
            notificationRepository.deleteByTaskId(taskId);
        }

        // 3-2) 스케줄/데일리 (checklist_item_id FK)
        scheduleBlockRepository.deleteByFeatureId(featureId);
        dailyChecklistRepository.deleteByFeatureId(featureId);

        // 3-3) 체크리스트 아이템
        checklistItemRepository.deleteByFeatureId(featureId);

        // 3-4) 태그 연결, 가중치
        taskTagRepository.deleteByFeatureId(featureId);
        taskWeightRepository.deleteByFeatureId(featureId);

        // 3-5) 댓글 첨부파일 S3 삭제 → DB 삭제 → 댓글 삭제
        List<CommentAttachment> attachments = commentAttachmentRepository.findByFeatureId(featureId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByFeatureId(featureId);
        commentRepository.deleteByFeatureId(featureId);

        // 4) Task 삭제
        taskRepository.deleteByFeatureId(featureId);

        // 5) Feature 삭제
        int deletedPosition = feature.getPosition();
        featureRepository.delete(feature);

        // 삭제된 Feature 뒤의 Feature들 position 감소
        List<Feature> featuresToShift = featureRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .filter(f -> f.getPosition() > deletedPosition)
                .toList();

        for (Feature f : featuresToShift) {
            f.updatePosition(f.getPosition() - 1);
        }

        log.info("Feature deleted: {} by user: {}", featureId, userId);

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_DELETED, userId, deleter.getName(), Map.of("id", featureId));
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public FeatureResponse.ListResponse reorderFeatures(String boardId, String userId, FeatureRequest.Reorder request) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<Feature> allFeatures = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
        Map<String, Feature> featureMap = allFeatures.stream()
                .collect(Collectors.toMap(Feature::getId, f -> f));

        // 요청된 Feature ID들이 모두 해당 보드의 Feature인지 확인
        for (String featureId : request.getFeatureIds()) {
            if (!featureMap.containsKey(featureId)) {
                throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
            }
        }

        if (request.getFeatureIds().size() != allFeatures.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 순서 업데이트
        List<String> featureIds = request.getFeatureIds();
        for (int i = 0; i < featureIds.size(); i++) {
            Feature feature = featureMap.get(featureIds.get(i));
            feature.updatePosition(i);
        }

        log.info("Features reordered in board: {} by user: {}", boardId, userId);

        Map<String, List<Tag>> featureTagsMap = getFeatureTagsMap(allFeatures);
        // Fetch Join으로 N+1 방지
        FeatureResponse.ListResponse response = FeatureResponse.ListResponse.of(
                featureRepository.findByBoardIdWithFetch(boardId),
                featureTagsMap
        );

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURES_REORDERED, userId, user.getName(), response);
        return response;
    }

    private Map<String, List<Tag>> getFeatureTagsMap(List<Feature> features) {
        if (features.isEmpty()) return Map.of();

        List<String> featureIds = features.stream().map(Feature::getId).toList();
        // Fetch Join으로 N+1 방지
        List<FeatureTag> featureTags = featureTagRepository.findByFeatureIdInWithFetch(featureIds);

        return featureTags.stream()
                .collect(Collectors.groupingBy(
                        ft -> ft.getFeature().getId(),
                        Collectors.mapping(FeatureTag::getTag, Collectors.toList())
                ));
    }
}
