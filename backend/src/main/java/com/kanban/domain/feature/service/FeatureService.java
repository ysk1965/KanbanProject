package com.kanban.domain.feature.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.dto.FeatureRequest;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.tag.FeatureTag;
import com.kanban.domain.tag.FeatureTagRepository;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
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

    public FeatureResponse.ListResponse getFeatures(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Feature> features = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
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

        List<Tag> tags = featureTagRepository.findByFeatureId(featureId).stream()
                .map(FeatureTag::getTag)
                .toList();

        return FeatureResponse.Detail.of(feature, tags);
    }

    @Transactional
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
                .priority(request.getPriority())
                .dueDate(request.getDueDate())
                .position(newPosition)
                .createdBy(creator)
                .build();

        featureRepository.save(feature);

        log.info("Feature created: {} in board: {} by user: {}", feature.getId(), boardId, userId);

        return FeatureResponse.Detail.of(feature, List.of());
    }

    @Transactional
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
                request.getPriority(),
                request.getDueDate()
        );

        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            feature.updateAssignee(assignee);
        }

        List<Tag> tags = featureTagRepository.findByFeatureId(featureId).stream()
                .map(FeatureTag::getTag)
                .toList();

        log.info("Feature updated: {} by user: {}", featureId, userId);

        return FeatureResponse.Detail.of(feature, tags);
    }

    @Transactional
    public void deleteFeature(String boardId, String featureId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        // 관련 태그 연결 삭제
        featureTagRepository.deleteByFeatureId(featureId);

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
    }

    @Transactional
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
        return FeatureResponse.ListResponse.of(
                featureRepository.findByBoardIdOrderByPositionAsc(boardId),
                featureTagsMap
        );
    }

    private Map<String, List<Tag>> getFeatureTagsMap(List<Feature> features) {
        List<String> featureIds = features.stream().map(Feature::getId).toList();
        List<FeatureTag> featureTags = featureTagRepository.findByFeatureIdIn(featureIds);

        return featureTags.stream()
                .collect(Collectors.groupingBy(
                        ft -> ft.getFeature().getId(),
                        Collectors.mapping(FeatureTag::getTag, Collectors.toList())
                ));
    }
}
