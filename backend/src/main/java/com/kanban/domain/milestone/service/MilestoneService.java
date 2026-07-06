package com.kanban.domain.milestone.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneAllocation;
import com.kanban.domain.milestone.MilestoneAllocationRepository;
import com.kanban.domain.milestone.MilestoneBlockConfig;
import com.kanban.domain.milestone.MilestoneBlockConfigRepository;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.milestone.dto.MilestoneRequest;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
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
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MilestoneService {

    private final MilestoneRepository milestoneRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final MilestoneBlockConfigRepository milestoneBlockConfigRepository;
    private final FeatureRepository featureRepository;
    private final BoardRepository boardRepository;
    private final BlockRepository blockRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;

    public MilestoneResponse.ListResponse getMilestones(String boardId, String userId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        return getMilestonesInternal(boardId);
    }

    /** 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용) */
    public MilestoneResponse.ListResponse getMilestonesInternal(String boardId) {
        validateMilestoneAccess(boardId);

        // 1회 쿼리로 마일스톤 + 연관 엔티티 조회
        List<Milestone> milestones = milestoneRepository.findByBoardIdWithDetailsOrderByStartDateAsc(boardId);

        if (milestones.isEmpty()) {
            return MilestoneResponse.ListResponse.of(milestones, Map.of(), Map.of(), Map.of(), Map.of());
        }

        // 1회 쿼리로 모든 마일스톤의 features 조회 (N+1 해결)
        List<MilestoneFeature> allMilestoneFeatures = milestoneFeatureRepository.findByBoardIdWithFeatures(boardId);

        // 마일스톤 ID별로 링크 그룹핑 — 표시용 전체
        Map<String, List<MilestoneFeature>> linksMap = allMilestoneFeatures.stream()
                .collect(Collectors.groupingBy(mf -> mf.getMilestone().getId()));

        // 피처별 홈(대표) 마일스톤 파생: 연결된 마일스톤 중 가장 이른 시작일(동률 시 마일스톤 id)
        Map<String, LocalDate> msStart = milestones.stream()
                .collect(Collectors.toMap(Milestone::getId, Milestone::getStartDate));
        Map<String, String> homeByFeature = deriveHomeMilestones(allMilestoneFeatures, msStart);

        // (마일스톤, 피처)별 태스크 카운트 1회 집계 — 진행률 + 피처별 카운트 공용
        Map<String, Map<String, int[]>> countsMap = taskCountsByMilestoneFeature(boardId);

        // 각 마일스톤의 진행률 계산 — 그 마일스톤에 배정된 태스크 기준
        Map<String, Integer> progressMap = new HashMap<>();
        for (Milestone milestone : milestones) {
            progressMap.put(milestone.getId(), progressFromCounts(countsMap.get(milestone.getId())));
        }

        return MilestoneResponse.ListResponse.of(milestones, linksMap, progressMap, countsMap, homeByFeature);
    }

    public MilestoneResponse.Detail getMilestone(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        return buildDetail(milestone);
    }

    @Transactional
    public MilestoneResponse.Detail createMilestone(String boardId, String userId, MilestoneRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);
        validateMilestoneAccess(boardId);

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

        // Feature 연결 (N+1 방지: 배치 조회)
        if (request.getFeatureIds() != null && !request.getFeatureIds().isEmpty()) {
            List<Feature> featuresToLink = featureRepository.findAllById(request.getFeatureIds());
            if (featuresToLink.size() != request.getFeatureIds().size()) {
                throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
            }

            List<MilestoneFeature> links = new ArrayList<>();
            for (Feature feature : featuresToLink) {
                if (!feature.getBoard().getId().equals(boardId)) {
                    throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
                }
                links.add(MilestoneFeature.create(milestone, feature));
            }
            milestoneFeatureRepository.saveAll(links);
        }

        log.info("Milestone created: {} in board: {} by user: {}", milestone.getId(), boardId, userId);

        return buildDetail(milestone);
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

        log.info("Milestone updated: {} by user: {}", milestoneId, userId);

        return buildDetail(milestone);
    }

    @Transactional
    public void deleteMilestone(String boardId, String milestoneId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        // 이 마일스톤에 배정된 태스크의 배정 해제 (FK는 ON DELETE SET NULL이지만 영속성 컨텍스트 일관성 위해 명시)
        taskRepository.clearMilestoneByMilestoneId(milestoneId);

        // 관련 데이터 삭제 (FK 의존성 순서: leaf → parent)
        milestoneAllocationRepository.deleteByMilestoneId(milestoneId);
        milestoneFeatureRepository.deleteByMilestoneId(milestoneId);

        // 마일스톤 전용 블록의 태스크를 Task 고정 블록으로 이동 후 삭제
        List<Block> milestoneBlocks = blockRepository.findByMilestoneIdOrderByPositionAsc(milestoneId);
        if (!milestoneBlocks.isEmpty()) {
            Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));
            for (Block milestoneBlock : milestoneBlocks) {
                taskRepository.moveTasksToBlock(milestoneBlock.getId(), taskBlock);
            }
            blockRepository.deleteByMilestoneId(milestoneId);
        }

        // 숨김 설정 정리
        milestoneBlockConfigRepository.deleteByMilestoneId(milestoneId);

        // Board의 selectedMilestoneId가 이 마일스톤을 참조하면 해제
        Board board = milestone.getBoard();
        if (milestoneId.equals(board.getSelectedMilestoneId())) {
            board.updateSelectedMilestone(null);
        }

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

        // 이미 연결된 Feature ID 배치 조회 (N+1 방지)
        Set<String> existingFeatureIds = milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId)
                .stream().collect(Collectors.toSet());

        List<String> newFeatureIds = request.getFeatureIds().stream()
                .filter(id -> !existingFeatureIds.contains(id))
                .collect(Collectors.toList());

        if (!newFeatureIds.isEmpty()) {
            List<Feature> featuresToAdd = featureRepository.findAllById(newFeatureIds);

            List<MilestoneFeature> newLinks = new ArrayList<>();
            for (Feature feature : featuresToAdd) {
                if (!feature.getBoard().getId().equals(boardId)) {
                    throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
                }
                newLinks.add(MilestoneFeature.create(milestone, feature));
            }
            milestoneFeatureRepository.saveAll(newLinks);
        }

        log.info("Features added to milestone: {} by user: {}", milestoneId, userId);

        return buildDetail(milestone);
    }

    @Transactional
    public void removeFeature(String boardId, String milestoneId, String featureId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        MilestoneFeature target = milestoneFeatureRepository
                .findByMilestoneIdAndFeatureId(milestoneId, featureId).orElse(null);
        if (target == null) {
            return;
        }
        milestoneFeatureRepository.delete(target);
        milestoneFeatureRepository.flush();

        // 제거 후 남은 링크 중 가장 이른 마일스톤이 새 홈(대표). 삭제를 먼저 flush해야 파생이 정확.
        Milestone newHome = milestoneFeatureRepository.findByFeatureIdOrderByMilestoneStartDate(featureId)
                .stream().findFirst()
                .map(MilestoneFeature::getMilestone)
                .orElse(null);

        // 제거된 마일스톤에 배정돼 있던 이 피처의 태스크를 새 홈 마일스톤(없으면 null)으로 재배정
        // (불변식: task.milestone ∈ 피처가 연결된 마일스톤)
        List<Task> orphanTasks = taskRepository.findByFeatureIdAndMilestoneId(featureId, milestoneId);
        for (Task tk : orphanTasks) {
            tk.assignMilestone(newHome);
        }

        log.info("Feature {} removed from milestone {} by user: {} ({} tasks reassigned)",
                featureId, milestoneId, userId, orphanTasks.size());
    }

    /** 마일스톤 상세 응답 구성 — 표시용 전체 링크 + 진행률/피처 카운트(태스크 단위, 이 마일스톤 스코프) */
    private MilestoneResponse.Detail buildDetail(Milestone milestone) {
        List<MilestoneFeature> links = milestoneFeatureRepository.findWithFeatureByMilestoneId(milestone.getId());
        Map<String, int[]> featureCounts = taskCountsByMilestoneFeature(milestone.getBoard().getId())
                .getOrDefault(milestone.getId(), Map.of());
        int progress = progressFromCounts(featureCounts);

        // 이 마일스톤에 속한 각 피처의 홈(대표) 마일스톤 파생 (가장 이른 시작일, 동률 시 마일스톤 id)
        Map<String, String> homeByFeature = new HashMap<>();
        for (MilestoneFeature link : links) {
            String featureId = link.getFeature().getId();
            if (homeByFeature.containsKey(featureId)) {
                continue;
            }
            milestoneFeatureRepository.findByFeatureIdOrderByMilestoneStartDate(featureId).stream()
                    .findFirst()
                    .ifPresent(first -> homeByFeature.put(featureId, first.getMilestone().getId()));
        }

        return MilestoneResponse.Detail.of(milestone, links, progress, featureCounts, homeByFeature);
    }

    /**
     * 피처별 홈(대표) 마일스톤 파생 — 연결된 마일스톤 중 시작일이 가장 이른 것(동률 시 마일스톤 id).
     * 저장된 플래그가 아니라 링크와 마일스톤 시작일로 계산한다.
     */
    private Map<String, String> deriveHomeMilestones(List<MilestoneFeature> allLinks, Map<String, LocalDate> msStart) {
        Map<String, String> home = new HashMap<>();
        Map<String, LocalDate> bestStart = new HashMap<>();
        for (MilestoneFeature link : allLinks) {
            String featureId = link.getFeature().getId();
            String milestoneId = link.getMilestone().getId();
            LocalDate start = msStart.get(milestoneId);
            if (start == null) {
                continue;
            }
            LocalDate curStart = bestStart.get(featureId);
            String curMilestone = home.get(featureId);
            boolean better = curStart == null
                    || start.isBefore(curStart)
                    || (start.isEqual(curStart) && milestoneId.compareTo(curMilestone) < 0);
            if (better) {
                bestStart.put(featureId, start);
                home.put(featureId, milestoneId);
            }
        }
        return home;
    }

    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
    public void toggleBlockVisibility(String boardId, String milestoneId, String blockId, boolean hidden, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        Milestone milestone = getMilestoneWithBoardCheck(boardId, milestoneId);

        Block block = blockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
        }

        // 고정 블록은 숨길 수 없음
        if (block.isFixed()) {
            throw new BusinessException(ErrorCode.BLOCK_CANNOT_HIDE_FIXED);
        }

        // 마일스톤 전용 블록은 이 API로 숨길 수 없음 (삭제를 사용)
        if (block.isMilestoneSpecific()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        Optional<MilestoneBlockConfig> existingConfig = milestoneBlockConfigRepository.findByMilestoneIdAndBlockId(milestoneId, blockId);

        if (existingConfig.isPresent()) {
            existingConfig.get().updateHidden(hidden);
        } else {
            MilestoneBlockConfig config = MilestoneBlockConfig.create(milestone, block, hidden);
            milestoneBlockConfigRepository.save(config);
        }

        log.info("Block {} visibility changed to hidden={} in milestone {} by user: {}", blockId, hidden, milestoneId, userId);

        // WebSocket 이벤트
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.BLOCK_VISIBILITY_CHANGED, userId, null,
                Map.of("blockId", blockId, "milestoneId", milestoneId, "hidden", hidden));
    }

    /**
     * 보드의 (마일스톤, 피처)별 태스크 카운트 집계.
     * 반환: milestoneId → (featureId → [total, completed])
     */
    private Map<String, Map<String, int[]>> taskCountsByMilestoneFeature(String boardId) {
        Map<String, Map<String, int[]>> result = new HashMap<>();
        for (Object[] row : taskRepository.countByMilestoneAndFeature(boardId)) {
            String milestoneId = (String) row[0];
            String featureId = (String) row[1];
            int total = ((Number) row[2]).intValue();
            int completed = ((Number) row[3]).intValue();
            result.computeIfAbsent(milestoneId, k -> new HashMap<>())
                    .put(featureId, new int[]{total, completed});
        }
        return result;
    }

    /** 마일스톤의 피처별 카운트 맵에서 진행률(%) 산출 */
    private int progressFromCounts(Map<String, int[]> featureCounts) {
        if (featureCounts == null || featureCounts.isEmpty()) {
            return 0;
        }
        int total = 0;
        int completed = 0;
        for (int[] c : featureCounts.values()) {
            total += c[0];
            completed += c[1];
        }
        if (total == 0) {
            return 0;
        }
        return (int) Math.round((double) completed / total * 100);
    }

    // ==================== Allocation Methods ====================

    public MilestoneResponse.AllocationListResponse getAllocations(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Milestone milestone = getMilestoneWithBoardCheck(boardId, milestoneId);

        List<MilestoneAllocation> allocations = milestoneAllocationRepository.findByMilestoneIdWithMember(milestoneId);

        // 마일스톤 기간 내 Feature에 속한 Task들의 ScheduleBlock 조회
        Map<String, Double> memberActualHours = calculateMemberActualHours(milestone);

        List<MilestoneResponse.AllocationDto> allocationDtos = allocations.stream()
                .map(allocation -> {
                    Double actualHours = memberActualHours.getOrDefault(allocation.getMember().getId(), 0.0);
                    return MilestoneResponse.AllocationDto.of(allocation, actualHours);
                })
                .collect(Collectors.toList());

        return MilestoneResponse.AllocationListResponse.of(allocationDtos, milestone.getDefaultHoursPerDay());
    }

    @Transactional
    public MilestoneResponse.AllocationDto createAllocation(
            String boardId, String milestoneId, String userId,
            MilestoneRequest.CreateAllocation request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = getMilestoneWithBoardCheck(boardId, milestoneId);

        User member = userRepository.findById(request.getMemberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 이미 할당되어 있는지 확인
        if (milestoneAllocationRepository.existsByMilestoneIdAndMemberId(milestoneId, request.getMemberId())) {
            throw new BusinessException(ErrorCode.MILESTONE_ALLOCATION_ALREADY_EXISTS);
        }

        MilestoneAllocation allocation = MilestoneAllocation.create(
                milestone, member, request.getWorkingDays(), request.getTotalAllocatedHours()
        );
        milestoneAllocationRepository.save(allocation);

        Map<String, Double> memberActualHours = calculateMemberActualHours(milestone);
        Double actualHours = memberActualHours.getOrDefault(member.getId(), 0.0);

        log.info("Allocation created for member {} in milestone {} by user: {}",
                request.getMemberId(), milestoneId, userId);

        return MilestoneResponse.AllocationDto.of(allocation, actualHours);
    }

    @Transactional
    public MilestoneResponse.AllocationDto updateAllocation(
            String boardId, String milestoneId, String allocationId, String userId,
            MilestoneRequest.UpdateAllocation request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Milestone milestone = getMilestoneWithBoardCheck(boardId, milestoneId);

        MilestoneAllocation allocation = milestoneAllocationRepository.findById(allocationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_ALLOCATION_NOT_FOUND));

        if (!allocation.getMilestone().getId().equals(milestoneId)) {
            throw new BusinessException(ErrorCode.MILESTONE_ALLOCATION_NOT_FOUND);
        }

        allocation.updateAllocation(request.getWorkingDays(), request.getTotalAllocatedHours());

        Map<String, Double> memberActualHours = calculateMemberActualHours(milestone);
        Double actualHours = memberActualHours.getOrDefault(allocation.getMember().getId(), 0.0);

        log.info("Allocation {} updated in milestone {} by user: {}", allocationId, milestoneId, userId);

        return MilestoneResponse.AllocationDto.of(allocation, actualHours);
    }

    @Transactional
    public void deleteAllocation(String boardId, String milestoneId, String allocationId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        getMilestoneWithBoardCheck(boardId, milestoneId);

        MilestoneAllocation allocation = milestoneAllocationRepository.findById(allocationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_ALLOCATION_NOT_FOUND));

        if (!allocation.getMilestone().getId().equals(milestoneId)) {
            throw new BusinessException(ErrorCode.MILESTONE_ALLOCATION_NOT_FOUND);
        }

        milestoneAllocationRepository.delete(allocation);

        log.info("Allocation {} deleted from milestone {} by user: {}", allocationId, milestoneId, userId);
    }

    private Milestone getMilestoneWithBoardCheck(String boardId, String milestoneId) {
        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));

        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        return milestone;
    }

    /**
     * 마일스톤에 속한 Feature들의 Task에 연결된 ScheduleBlock을 기반으로
     * 각 멤버별 실제 작업 시간을 계산
     */
    private Map<String, Double> calculateMemberActualHours(Milestone milestone) {
        String boardId = milestone.getBoard().getId();

        // 마일스톤에 속한 Feature ID 조회
        List<String> featureIds = milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestone.getId());
        if (featureIds.isEmpty()) {
            return Map.of();
        }

        Set<String> featureIdSet = Set.copyOf(featureIds);

        // 보드의 모든 ScheduleBlock 중 마일스톤 기간 내, 해당 Feature에 속한 것만 필터링
        List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository.findByBoardIdAndScheduledDateBetween(
                boardId, milestone.getStartDate(), milestone.getEndDate()
        );

        return scheduleBlocks.stream()
                .filter(sb -> sb.getChecklistItem() != null &&
                        sb.getChecklistItem().getTask() != null &&
                        sb.getChecklistItem().getTask().getFeature() != null &&
                        featureIdSet.contains(sb.getChecklistItem().getTask().getFeature().getId()))
                .collect(Collectors.groupingBy(
                        sb -> sb.getAssignee().getId(),
                        Collectors.summingDouble(sb -> {
                            if (sb.getStartTime() == null || sb.getEndTime() == null) {
                                return 0.0;
                            }
                            return Duration.between(sb.getStartTime(), sb.getEndTime()).toMinutes() / 60.0;
                        })
                ));
    }

    private void validateMilestoneAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessMilestone()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }
}
