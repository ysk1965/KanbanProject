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
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.contractor.repository.BoardContractorRepository;
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
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kanban.domain.task.Task;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
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
    private final BoardContractorRepository contractorRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentRepository commentRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final NotificationRepository notificationRepository;
    private final FileUploadService fileUploadService;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;
    private final EntityManager entityManager;

    /** 자기 자신 프록시 — public 메서드에서 @Cacheable 내부 메서드를 호출할 때 AOP 인터셉트 보장용 */
    @Autowired
    @Lazy
    private FeatureService self;

    public FeatureResponse.ListResponse getFeatures(String boardId, String userId, String milestoneId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        // this.getFeaturesInternal()로 직접 호출하면 @Cacheable이 동작하지 않으므로 self 프록시 경유
        return self.getFeaturesInternal(boardId, milestoneId);
    }

    /**
     * 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용).
     * 캐시 이름/키는 기존 getFeatures와 동일 — 컨트롤러/Facade 경로가 같은 캐시 엔트리를 공유한다.
     */
    @Cacheable(value = "features", key = "#boardId", condition = "#milestoneId == null", unless = "#result == null")
    public FeatureResponse.ListResponse getFeaturesInternal(String boardId, String milestoneId) {
        log.debug("Features loaded from DB for board: {}, milestone: {}", boardId, milestoneId);
        // Fetch Join으로 N+1 방지
        List<Feature> features = featureRepository.findByBoardIdWithFetch(boardId);

        // 마일스톤 필터 적용
        if (milestoneId != null && !milestoneId.isEmpty()) {
            if ("none".equals(milestoneId)) {
                // 마일스톤 미지정 피처만 필터링
                Set<String> allMilestoneFeatureIds = new HashSet<>(
                        milestoneFeatureRepository.findAllFeatureIdsByBoardId(boardId)
                );
                features = features.stream()
                        .filter(f -> !allMilestoneFeatureIds.contains(f.getId()))
                        .collect(Collectors.toList());
            } else {
                Set<String> milestoneFeatureIds = new HashSet<>(
                        milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId)
                );
                features = features.stream()
                        .filter(f -> milestoneFeatureIds.contains(f.getId()))
                        .collect(Collectors.toList());
            }
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
        BoardContractor contractor = null;
        if (request.getAssigneeId() != null) {
            assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        } else if (request.getContractorId() != null) {
            contractor = contractorRepository.findByIdAndBoardId(request.getContractorId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
        }

        Integer maxPosition = featureRepository.findMaxPositionByBoardId(boardId);
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        Feature feature = Feature.builder()
                .board(board)
                .title(request.getTitle())
                .description(request.getDescription())
                .color(request.getColor())
                .assignee(assignee)
                .contractor(contractor)
                .startDate(request.getStartDate())
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
                request.getStartDate(),
                request.getDueDate()
        );

        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            feature.updateAssignee(assignee);
        } else if (request.getContractorId() != null) {
            BoardContractor contractor = contractorRepository.findByIdAndBoardId(request.getContractorId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONTRACTOR_NOT_FOUND));
            feature.updateContractor(contractor);
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

    /**
     * 소프트 삭제: Feature와 자식(Task, ChecklistItem)에 동일 timestamp의 deleted_at을 마킹.
     * 이관된 Task는 살아남고, 자식 데이터(댓글/첨부/스케줄 등)는 그대로 유지된다 → 휴지통에서 복구 시 함께 살아남.
     * 영구삭제(S3 첨부 정리 포함)는 BoardItemCleanupScheduler 또는 휴지통 비우기에서 hardDeleteFeature로 처리.
     */
    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void deleteFeature(String boardId, String featureId, String userId, FeatureRequest.Delete request) {
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

        // 태스크 이관 처리 (요청이 있는 경우) — 이관된 태스크는 살아남는다
        List<Map<String, String>> migratedTasks = new ArrayList<>();
        if (request != null && request.getTaskMigrations() != null && !request.getTaskMigrations().isEmpty()) {
            for (FeatureRequest.Delete.TaskMigration migration : request.getTaskMigrations()) {
                Task task = taskRepository.findById(migration.getTaskId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

                if (!task.getFeature().getId().equals(featureId)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
                }

                Feature targetFeature = featureRepository.findById(migration.getTargetFeatureId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

                if (!targetFeature.getBoard().getId().equals(boardId)) {
                    throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
                }

                if (targetFeature.getId().equals(featureId)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
                }

                task.moveToFeature(targetFeature);
                migratedTasks.add(Map.of(
                        "task_id", task.getId(),
                        "target_feature_id", targetFeature.getId()
                ));
            }
            taskRepository.flush();
        }

        // 부모와 자식이 정확히 같은 timestamp를 공유해야 cascade 복구 시 그룹 식별이 정확함
        LocalDateTime deletedAt = LocalDateTime.now(ZoneOffset.UTC);

        // 1) 자식 ChecklistItem 일괄 소프트 삭제 (이관된 task의 checklist는 task_id가 다른 feature 소속이라 영향 없음)
        checklistItemRepository.softDeleteByFeatureId(featureId, deletedAt, userId);

        // 2) 자식 Task 일괄 소프트 삭제
        taskRepository.softDeleteByFeatureId(featureId, deletedAt, userId);

        // 벌크 native UPDATE는 Hibernate 1차 캐시를 우회하므로 동기화
        entityManager.flush();
        entityManager.clear();

        // 3) Feature 삭제 전 position 조정 (살아있는 형제만 shift — @SQLRestriction 자동 적용)
        feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
        int deletedPosition = feature.getPosition();
        List<Feature> featuresToShift = featureRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .filter(f -> !f.getId().equals(featureId) && f.getPosition() > deletedPosition)
                .toList();

        for (Feature f : featuresToShift) {
            f.updatePosition(f.getPosition() - 1);
        }

        // 4) Feature 소프트 삭제
        feature.softDelete(userId, deletedAt);

        log.info("Feature soft-deleted: {} by user: {} (migrated {} tasks)", featureId, userId, migratedTasks.size());

        // WebSocket 이벤트 (FE는 보드에서 즉시 제거)
        Map<String, Object> eventData = new HashMap<>();
        eventData.put("id", featureId);
        if (!migratedTasks.isEmpty()) {
            eventData.put("migrated_tasks", migratedTasks);
        }
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_DELETED, userId, deleter.getName(), eventData);
    }

    /**
     * 영구삭제: 자식 데이터(댓글/첨부/S3/스케줄/태그/태스크) 전부 정리 후 Feature row 삭제.
     * 휴지통 비우기 / 보존기간 만료 스케줄러에서 호출. soft-deleted 상태든 활성 상태든 동작한다.
     */
    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void hardDeleteFeature(String boardId, String featureId) {
        Feature feature = featureRepository.findByIdIncludingDeleted(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        // 1) 마일스톤-피처 연결
        milestoneFeatureRepository.deleteByFeatureId(featureId);

        // 2) 피처 태그
        featureTagRepository.deleteByFeatureId(featureId);

        // 3-1) 알림 — soft-deleted 포함 모든 task 정리
        List<String> allTaskIds = taskRepository.findAllIdsByFeatureIdIncludingDeleted(featureId);
        for (String tid : allTaskIds) {
            notificationRepository.deleteByTaskId(tid);
        }

        // 3-2) 스케줄/데일리 — feature_id 기준 native bulk
        scheduleBlockRepository.deleteByFeatureId(featureId);
        dailyChecklistRepository.deleteByFeatureId(featureId);

        // 3-3) 체크리스트 (native: deleted 포함)
        checklistItemRepository.deleteByFeatureId(featureId);

        // 3-4) 태그/가중치
        taskTagRepository.deleteByFeatureId(featureId);
        taskWeightRepository.deleteByFeatureId(featureId);

        // 3-5) 댓글 첨부파일 S3 정리 → DB 정리 → 댓글
        List<CommentAttachment> attachments = commentAttachmentRepository.findByFeatureId(featureId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByFeatureId(featureId);
        commentRepository.deleteByFeatureId(featureId);

        // 4) 남은 Task hard delete (native: deleted 포함)
        taskRepository.deleteByFeatureId(featureId);

        entityManager.flush();
        entityManager.clear();

        // 5) Feature row 삭제 — @SQLRestriction이 SELECT만 영향, delete()는 PK 기준이라 무관
        feature = featureRepository.findByIdIncludingDeleted(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
        featureRepository.delete(feature);

        log.info("Feature hard-deleted: {}", featureId);
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
