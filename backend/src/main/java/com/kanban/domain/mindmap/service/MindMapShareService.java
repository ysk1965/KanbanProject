package com.kanban.domain.mindmap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.mindmap.BoardMindMap;
import com.kanban.domain.mindmap.BoardMindMapRepository;
import com.kanban.domain.mindmap.MindMapShare;
import com.kanban.domain.mindmap.MindMapShareRepository;
import com.kanban.domain.mindmap.dto.MindMapResponse;
import com.kanban.domain.mindmap.dto.MindMapShareRequest;
import com.kanban.domain.mindmap.dto.MindMapShareResponse;
import com.kanban.domain.mindmap.dto.PublicMindMapResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 마인드맵 외부 공유 — 설정 CRUD(보드 멤버용)와 공개 스냅샷 조회(인증 불요)를 담당한다.
 * 공개 응답은 레이아웃 + 피처/태스크/마일스톤을 서버에서 합성하며,
 * 공유 옵션으로 꺼진 데이터는 응답에서 필드 자체를 제거한다(프론트 숨김 금지 원칙).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MindMapShareService {

    private final MindMapShareRepository shareRepository;
    private final BoardMindMapRepository mindMapRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final ObjectMapper objectMapper;

    // ==================== 공유 설정 (보드 멤버용) ====================

    /** 공유 설정 조회 (Member 이상). 행이 없으면 기본값을 반환한다. */
    public MindMapShareResponse getShareSettings(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        return shareRepository.findByBoardId(boardId)
                .map(MindMapShareResponse::of)
                .orElseGet(MindMapShareResponse::empty);
    }

    /** 공유 설정 upsert (Member 이상). 최초 enable 시 share_code를 발급한다. */
    @Transactional
    public MindMapShareResponse updateShareSettings(String boardId, String userId,
                                                    MindMapShareRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        MindMapShare share = shareRepository.findByBoardId(boardId)
                .orElseGet(() -> MindMapShare.builder().boardId(boardId).createdBy(userId).build());
        share.updateSettings(request.isEnabled(), request.isShowTasks(), request.isShowAssignees(),
                request.isShowMemos(), request.getExpiresAt());
        share = shareRepository.save(share);
        return MindMapShareResponse.of(share);
    }

    /** share_code 재발급 (Member 이상). 기존 링크는 즉시 무효화된다. 행이 없으면 생성 후 enable. */
    @Transactional
    public MindMapShareResponse rotateShareCode(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        MindMapShare share = shareRepository.findByBoardId(boardId)
                .orElseGet(() -> MindMapShare.builder().boardId(boardId).createdBy(userId).build());
        share.rotateShareCode();
        share = shareRepository.save(share);
        return MindMapShareResponse.of(share);
    }

    // ==================== 공개 스냅샷 (인증 불요) ====================

    /**
     * 공개 스냅샷 조회. 코드 없음 · 비활성 · 만료를 모두 동일한 404로 처리해
     * 코드 무차별 대입으로 상태를 탐색할 수 없게 한다.
     */
    public PublicMindMapResponse getPublicSnapshot(String shareCode) {
        MindMapShare share = shareRepository.findByShareCode(shareCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.MINDMAP_SHARE_NOT_FOUND));

        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        if (!Boolean.TRUE.equals(share.getEnabled())
                || (share.getExpiresAt() != null && share.getExpiresAt().isBefore(nowUtc))) {
            throw new BusinessException(ErrorCode.MINDMAP_SHARE_NOT_FOUND);
        }

        Board board = boardRepository.findById(share.getBoardId())
                .filter(b -> !b.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.MINDMAP_SHARE_NOT_FOUND));

        boolean showTasks = Boolean.TRUE.equals(share.getShowTasks());
        boolean showAssignees = Boolean.TRUE.equals(share.getShowAssignees());
        boolean showMemos = Boolean.TRUE.equals(share.getShowMemos());

        // 마일스톤: 보드 API와 동일하게 시작일 오름차순 → idx 부여 (프론트 칩 색상 매핑 기준)
        List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(board.getId());
        Map<String, PublicMindMapResponse.MilestoneItem> milestoneItemById = new LinkedHashMap<>();
        for (int i = 0; i < milestones.size(); i++) {
            Milestone ms = milestones.get(i);
            milestoneItemById.put(ms.getId(), PublicMindMapResponse.MilestoneItem.builder()
                    .id(ms.getId())
                    .title(ms.getTitle())
                    .idx(i)
                    .build());
        }

        List<Feature> features = featureRepository.findByBoardIdWithFetch(board.getId());
        List<Task> tasks = taskRepository.findByBoardIdWithFetch(board.getId());

        return PublicMindMapResponse.builder()
                .boardName(board.getName())
                .layout(buildLayout(board.getId(), showMemos))
                .features(buildFeatures(features, tasks, milestoneItemById, showAssignees, board.getId()))
                .tasks(showTasks ? buildTasks(tasks, showAssignees) : List.of())
                .milestones(new ArrayList<>(milestoneItemById.values()))
                .generatedAt(nowUtc)
                .build();
    }

    /** board_mindmaps.data 파싱. show_memos=false면 메모 노드와 그 노드에 닿는 엣지를 제거한다. */
    private MindMapResponse buildLayout(String boardId, boolean showMemos) {
        List<JsonNode> nodes = new ArrayList<>();
        List<JsonNode> edges = new ArrayList<>();
        List<String> expandedFeatures = new ArrayList<>();

        BoardMindMap mindMap = mindMapRepository.findByBoardId(boardId).orElse(null);
        if (mindMap != null && mindMap.getData() != null && !mindMap.getData().isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(mindMap.getData());
                Set<String> removedNodeIds = new HashSet<>();
                if (root.has("nodes") && root.get("nodes").isArray()) {
                    root.get("nodes").forEach(n -> {
                        boolean isMemo = n.has("kind") && "memo".equals(n.get("kind").asText());
                        if (isMemo && !showMemos) {
                            if (n.has("id")) removedNodeIds.add(n.get("id").asText());
                            return;
                        }
                        nodes.add(n);
                    });
                }
                if (root.has("edges") && root.get("edges").isArray()) {
                    root.get("edges").forEach(e -> {
                        String source = e.has("source") ? e.get("source").asText() : "";
                        String target = e.has("target") ? e.get("target").asText() : "";
                        if (removedNodeIds.contains(source) || removedNodeIds.contains(target)) return;
                        edges.add(e);
                    });
                }
                if (root.has("expanded_features") && root.get("expanded_features").isArray()) {
                    root.get("expanded_features").forEach(n -> {
                        if (n.isTextual()) expandedFeatures.add(n.asText());
                    });
                }
            } catch (Exception e) {
                log.warn("Failed to parse stored mindmap data for board {}", boardId, e);
            }
        }
        return MindMapResponse.builder()
                .nodes(nodes)
                .edges(edges)
                .expandedFeatures(expandedFeatures)
                .build();
    }

    /**
     * 피처 목록 조립. 피처별 마일스톤은 태스크 배정(milestone_id) 집합에서 파생하고,
     * 배정이 하나도 없으면 피처-마일스톤 멤버십으로 폴백한다 (프론트 featureMilestonesMap 파생과 동일).
     */
    private List<PublicMindMapResponse.FeatureItem> buildFeatures(
            List<Feature> features, List<Task> tasks,
            Map<String, PublicMindMapResponse.MilestoneItem> milestoneItemById,
            boolean showAssignees, String boardId) {

        // feature_id → 태스크에 배정된 마일스톤 id 집합
        Map<String, Set<String>> taskMsByFeature = new HashMap<>();
        for (Task task : tasks) {
            if (task.getMilestone() == null) continue;
            taskMsByFeature.computeIfAbsent(task.getFeature().getId(), k -> new HashSet<>())
                    .add(task.getMilestone().getId());
        }

        // feature_id → 멤버십 마일스톤 id 집합 (태스크 배정이 없을 때 폴백)
        Map<String, Set<String>> membershipMsByFeature = milestoneFeatureRepository
                .findByBoardIdWithFeatures(boardId).stream()
                .collect(Collectors.groupingBy(
                        mf -> mf.getFeature().getId(),
                        Collectors.mapping(mf -> mf.getMilestone().getId(), Collectors.toSet())));

        return features.stream()
                .map(f -> {
                    Set<String> msIds = taskMsByFeature.getOrDefault(f.getId(),
                            membershipMsByFeature.getOrDefault(f.getId(), Set.of()));
                    List<PublicMindMapResponse.MilestoneItem> featureMilestones = msIds.stream()
                            .map(milestoneItemById::get)
                            .filter(java.util.Objects::nonNull)
                            .sorted(java.util.Comparator.comparingInt(PublicMindMapResponse.MilestoneItem::getIdx))
                            .toList();
                    return PublicMindMapResponse.FeatureItem.builder()
                            .id(f.getId())
                            .title(f.getTitle())
                            .color(f.getColor())
                            .status(f.getStatus() != null ? f.getStatus().name() : null)
                            .totalTasks(f.getTotalTasks() != null ? f.getTotalTasks() : 0)
                            .completedTasks(f.getCompletedTasks() != null ? f.getCompletedTasks() : 0)
                            .progressPercentage(f.getProgressPercentage())
                            .position(f.getPosition() != null ? f.getPosition() : 0)
                            .milestones(featureMilestones)
                            .assignee(showAssignees && f.getAssignee() != null
                                    ? PublicMindMapResponse.AssigneeItem.builder()
                                            .id(f.getAssignee().getId())
                                            .name(f.getAssignee().getName())
                                            .build()
                                    : null)
                            .build();
                })
                .toList();
    }

    /** 태스크 목록 조립. 담당자는 체크리스트 항목 담당자에서 파생한다 (TaskResponse와 동일 소스). */
    private List<PublicMindMapResponse.TaskItem> buildTasks(List<Task> tasks, boolean showAssignees) {
        Map<String, List<PublicMindMapResponse.AssigneeItem>> assigneesByTask = new HashMap<>();
        if (showAssignees && !tasks.isEmpty()) {
            List<String> taskIds = tasks.stream().map(Task::getId).toList();
            List<ChecklistItem> items = checklistItemRepository.findByTaskIdIn(taskIds);
            Map<String, List<ChecklistItem>> grouped = items.stream()
                    .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));
            for (Map.Entry<String, List<ChecklistItem>> entry : grouped.entrySet()) {
                List<PublicMindMapResponse.AssigneeItem> assignees = entry.getValue().stream()
                        .filter(ci -> ci.getAssignee() != null)
                        .collect(Collectors.toMap(
                                ci -> ci.getAssignee().getId(),
                                ci -> ci.getAssignee(),
                                (existing, replacement) -> existing,
                                LinkedHashMap::new))
                        .values().stream()
                        .map(u -> PublicMindMapResponse.AssigneeItem.builder()
                                .id(u.getId())
                                .name(u.getName())
                                .build())
                        .toList();
                if (!assignees.isEmpty()) {
                    assigneesByTask.put(entry.getKey(), assignees);
                }
            }
        }

        return tasks.stream()
                .map(t -> PublicMindMapResponse.TaskItem.builder()
                        .id(t.getId())
                        .featureId(t.getFeature().getId())
                        .title(t.getTitle())
                        .completed(Boolean.TRUE.equals(t.getIsCompleted()))
                        .milestoneId(t.getMilestone() != null ? t.getMilestone().getId() : null)
                        .position(t.getPosition() != null ? t.getPosition() : 0)
                        .featurePosition(t.getFeaturePosition() != null ? t.getFeaturePosition() : 0)
                        .assignees(showAssignees ? assigneesByTask.get(t.getId()) : null)
                        .build())
                .toList();
    }
}
