package com.kanban.domain.milestone.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.milestone.dto.MilestoneRequest;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MilestoneService {

    private final MilestoneRepository milestoneRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final FeatureRepository featureRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public MilestoneResponse.ListResponse getMilestones(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);

        Map<String, Integer> featureCountMap = new HashMap<>();
        Map<String, Integer> progressMap = new HashMap<>();

        for (Milestone milestone : milestones) {
            List<Feature> features = milestoneFeatureRepository.findFeaturesByMilestoneId(milestone.getId());
            featureCountMap.put(milestone.getId(), features.size());
            progressMap.put(milestone.getId(), calculateProgress(features));
        }

        return MilestoneResponse.ListResponse.of(milestones, featureCountMap, progressMap);
    }

    public MilestoneResponse.Detail getMilestone(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        List<Feature> features = milestoneFeatureRepository.findFeaturesByMilestoneId(milestoneId);
        int progress = calculateProgress(features);

        return MilestoneResponse.Detail.of(milestone, features, progress);
    }

    @Transactional
    public MilestoneResponse.Detail createMilestone(String boardId, String userId, MilestoneRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Milestone milestone = Milestone.builder()
                .board(board)
                .title(request.getTitle())
                .description(request.getDescription())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .createdBy(creator)
                .build();

        milestoneRepository.save(milestone);

        // Feature 연결
        if (request.getFeatureIds() != null && !request.getFeatureIds().isEmpty()) {
            for (String featureId : request.getFeatureIds()) {
                Feature feature = featureRepository.findById(featureId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

                if (!feature.getBoard().getId().equals(boardId)) {
                    throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
                }

                MilestoneFeature milestoneFeature = MilestoneFeature.create(milestone, feature);
                milestoneFeatureRepository.save(milestoneFeature);
            }
        }

        List<Feature> features = milestoneFeatureRepository.findFeaturesByMilestoneId(milestone.getId());
        int progress = calculateProgress(features);

        log.info("Milestone created: {} in board: {} by user: {}", milestone.getId(), boardId, userId);

        return MilestoneResponse.Detail.of(milestone, features, progress);
    }

    @Transactional
    public MilestoneResponse.Detail updateMilestone(String boardId, String milestoneId, String userId, MilestoneRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        milestone.updateInfo(
                request.getTitle(),
                request.getDescription(),
                request.getStartDate(),
                request.getEndDate()
        );

        List<Feature> features = milestoneFeatureRepository.findFeaturesByMilestoneId(milestoneId);
        int progress = calculateProgress(features);

        log.info("Milestone updated: {} by user: {}", milestoneId, userId);

        return MilestoneResponse.Detail.of(milestone, features, progress);
    }

    @Transactional
    public void deleteMilestone(String boardId, String milestoneId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        // 연결된 MilestoneFeature 먼저 삭제
        milestoneFeatureRepository.deleteByMilestoneId(milestoneId);

        milestoneRepository.delete(milestone);

        log.info("Milestone deleted: {} by user: {}", milestoneId, userId);
    }

    @Transactional
    public MilestoneResponse.Detail addFeatures(String boardId, String milestoneId, String userId, MilestoneRequest.AddFeatures request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        for (String featureId : request.getFeatureIds()) {
            // 이미 연결되어 있는지 확인
            if (milestoneFeatureRepository.existsByMilestoneIdAndFeatureId(milestoneId, featureId)) {
                continue; // 이미 연결된 경우 스킵
            }

            Feature feature = featureRepository.findById(featureId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

            if (!feature.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
            }

            MilestoneFeature milestoneFeature = MilestoneFeature.create(milestone, feature);
            milestoneFeatureRepository.save(milestoneFeature);
        }

        List<Feature> features = milestoneFeatureRepository.findFeaturesByMilestoneId(milestoneId);
        int progress = calculateProgress(features);

        log.info("Features added to milestone: {} by user: {}", milestoneId, userId);

        return MilestoneResponse.Detail.of(milestone, features, progress);
    }

    @Transactional
    public void removeFeature(String boardId, String milestoneId, String featureId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        milestoneFeatureRepository.deleteByMilestoneIdAndFeatureId(milestoneId, featureId);

        log.info("Feature {} removed from milestone {} by user: {}", featureId, milestoneId, userId);
    }

    private int calculateProgress(List<Feature> features) {
        if (features.isEmpty()) {
            return 0;
        }

        int totalTasks = 0;
        int completedTasks = 0;

        for (Feature feature : features) {
            totalTasks += feature.getTotalTasks();
            completedTasks += feature.getCompletedTasks();
        }

        if (totalTasks == 0) {
            return 0;
        }

        return (int) Math.round((double) completedTasks / totalTasks * 100);
    }
}
