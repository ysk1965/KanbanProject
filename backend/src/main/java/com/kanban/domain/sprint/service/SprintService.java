package com.kanban.domain.sprint.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStage;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.sprint.dto.SprintResponse;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SprintService {

    private final SprintRepository sprintRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final MilestoneRepository milestoneRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    // ==================== Read ====================

    public SprintResponse.Board getSprintBoard(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        return buildBoard(milestone);
    }

    // ==================== Toggle (관리자) ====================

    @Transactional
    public SprintResponse.Board toggleSprintMode(String boardId, String milestoneId, boolean enabled, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        milestone.updateSprintEnabled(enabled);

        if (enabled) {
            // 활성 스프린트가 없으면 기본 Sprint 1 자동 생성
            boolean hasActive = sprintRepository
                    .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(milestoneId, SprintStatus.ACTIVE)
                    .isPresent();
            if (!hasActive) {
                int nextSeq = sprintRepository.findMaxSequenceNo(milestoneId) + 1;
                createSprint(milestone, nextSeq);
            }
        } else {
            // 병합: 담긴 카드를 모두 백로그로 되돌리고 스프린트 삭제 (완료 여부는 유지)
            List<ChecklistItem> inSprint = checklistItemRepository.findInSprintByMilestoneId(milestoneId);
            inSprint.forEach(item -> item.removeFromSprint());
            sprintRepository.deleteByMilestoneId(milestoneId);
        }
        return buildBoard(milestone);
    }

    // ==================== 담기 / 빼기 / 이동 (멤버+) ====================

    @Transactional
    public SprintResponse.Board addItem(String boardId, String sprintId, String checklistItemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        ChecklistItem item = checklistItemRepository.findById(checklistItemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        // 항목이 스프린트와 같은 마일스톤에 속하는지 검증
        Milestone itemMilestone = item.getTask() != null ? item.getTask().getMilestone() : null;
        if (itemMilestone == null || !itemMilestone.getId().equals(sprint.getMilestone().getId())) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
        }
        item.assignToSprint(sprint);
        return buildBoard(sprint.getMilestone());
    }

    @Transactional
    public SprintResponse.Board removeItem(String boardId, String sprintId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        item.removeFromSprint();
        return buildBoard(sprint.getMilestone());
    }

    @Transactional
    public SprintResponse.Board moveStage(String boardId, String itemId, String stageStr, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        Sprint sprint = item.getSprint();
        if (sprint == null) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
        }
        if (!sprint.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        SprintStage stage = parseStage(stageStr);
        item.moveSprintStage(stage);
        // B안: Done 도달 시 완료자 기록 (담당자가 아니어도 됨). Done 밖으로 나가면 uncomplete()가 자동 클리어.
        if (stage == SprintStage.DONE) {
            item.recordCompleter(userRepository.getReferenceById(userId));
        }
        return buildBoard(sprint.getMilestone());
    }

    // ==================== 라이프사이클: 종료 / 재활성화 (관리자) ====================

    /**
     * 스프린트 종료 — 모든 카드가 Done(100%)일 때만 가능. 완료율 동결 후:
     * - 최신 스프린트를 종료하면 다음 스프린트를 새로 생성해 활성화
     * - 재활성화된(과거) 스프린트를 재동결하면 보관 중이던 최신 스프린트를 다시 활성화
     */
    @Transactional
    public SprintResponse.Board closeSprint(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        if (!sprint.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ACTIVE);
        }

        int total = checklistItemRepository.countBySprintId(sprintId);
        int done = checklistItemRepository.countBySprintIdAndStage(sprintId, SprintStage.DONE);
        if (total == 0 || done != total) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ALL_DONE);
        }

        Milestone milestone = sprint.getMilestone();
        String milestoneId = milestone.getId();
        sprint.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));

        Sprint latest = sprintRepository.findFirstByMilestoneIdOrderBySequenceNoDesc(milestoneId)
                .orElse(sprint);
        if (latest.getId().equals(sprint.getId())) {
            // 최신 스프린트 종료 → 다음 스프린트 생성
            int nextSeq = sprintRepository.findMaxSequenceNo(milestoneId) + 1;
            createSprint(milestone, nextSeq);
        } else {
            // 재활성화된 과거 스프린트 재동결 → 보관 중이던 최신 스프린트 복귀
            latest.reactivate();
        }
        return buildBoard(milestone);
    }

    /**
     * 아카이브 스프린트 재활성화 — 현재 활성 스프린트를 보관(동결)하고 대상을 활성화.
     * 이미 재활성화 상태(활성 스프린트가 최신이 아님)면 차단.
     */
    @Transactional
    public SprintResponse.Board reactivateSprint(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint target = loadSprint(boardId, sprintId);
        if (target.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_ALREADY_ACTIVE);
        }
        Milestone milestone = target.getMilestone();
        String milestoneId = milestone.getId();
        int maxSeq = sprintRepository.findMaxSequenceNo(milestoneId);

        // 현재 활성 스프린트 확인 — 이미 재활성화 상태(활성이 최신이 아님)면 차단
        Sprint active = sprintRepository
                .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(milestoneId, SprintStatus.ACTIVE)
                .orElse(null);
        if (active != null) {
            if (active.getSequenceNo() != maxSeq) {
                throw new BusinessException(ErrorCode.SPRINT_REACTIVATION_BLOCKED);
            }
            // 최신 활성 스프린트 보관: 현재 진행 상황을 동결 후 ARCHIVED
            int total = checklistItemRepository.countBySprintId(active.getId());
            int done = checklistItemRepository.countBySprintIdAndStage(active.getId(), SprintStage.DONE);
            active.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));
        }

        target.reactivate();
        return buildBoard(milestone);
    }

    /**
     * 재활성화 취소 — 재활성화된 스프린트를 원래 동결 기록 그대로 되돌리고,
     * 보관 중이던 최신 스프린트를 다시 활성화한다.
     * (주의: 세션 중 항목 stage 편집은 별도 롤백하지 않음 — 아카이브는 동결 수치로 표시)
     */
    @Transactional
    public SprintResponse.Board cancelReactivation(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint reactivated = loadSprint(boardId, sprintId);
        if (!reactivated.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ACTIVE);
        }
        Milestone milestone = reactivated.getMilestone();
        int maxSeq = sprintRepository.findMaxSequenceNo(milestone.getId());
        if (reactivated.getSequenceNo() == maxSeq) {
            // 최신 스프린트 자체는 재활성화 대상이 아님
            throw new BusinessException(ErrorCode.SPRINT_NOT_IN_REACTIVATION);
        }
        // 원래 동결 수치 보존한 채 ARCHIVED 복귀
        reactivated.archive(reactivated.getCompletedCount(), reactivated.getTotalCount(),
                LocalDateTime.now(ZoneOffset.UTC));
        // 보관 중이던 최신 스프린트 복귀
        Sprint latest = sprintRepository.findFirstByMilestoneIdOrderBySequenceNoDesc(milestone.getId())
                .orElse(reactivated);
        latest.reactivate();
        return buildBoard(milestone);
    }

    /**
     * 항목 재개 — 아카이브(또는 다른) 스프린트의 항목을 현재 활성 스프린트로 다시 담는다 (Sprint 컬럼, 미완료로).
     */
    @Transactional
    public SprintResponse.Board resumeItem(String boardId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        Sprint from = item.getSprint();
        if (from == null) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
        }
        if (!from.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        Milestone milestone = from.getMilestone();
        Sprint active = sprintRepository
                .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(milestone.getId(), SprintStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_NOT_FOUND));
        item.assignToSprint(active);
        item.moveSprintStage(SprintStage.SPRINT);
        return buildBoard(milestone);
    }

    /** 특정 스프린트의 담긴 카드 목록 (아카이브 열람 / 항목 재개 UI용) */
    public List<SprintResponse.ItemCard> getSprintItems(String boardId, String sprintId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        loadSprint(boardId, sprintId);
        return checklistItemRepository.findBySprintId(sprintId).stream()
                .map(SprintResponse.ItemCard::of)
                .toList();
    }

    // ==================== Helpers ====================

    private Milestone loadMilestone(String boardId, String milestoneId) {
        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));
        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }
        validateAccess(boardId);
        return milestone;
    }

    private Sprint loadSprint(String boardId, String sprintId) {
        Sprint sprint = sprintRepository.findById(sprintId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_NOT_FOUND));
        if (!sprint.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        return sprint;
    }

    private void validateAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessMilestone()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }

    private Sprint createSprint(Milestone milestone, int seq) {
        Sprint sprint = Sprint.builder()
                .milestone(milestone)
                .name("Sprint " + seq)
                .sequenceNo(seq)
                .status(SprintStatus.ACTIVE)
                .build();
        return sprintRepository.save(sprint);
    }

    private SprintStage parseStage(String raw) {
        if (raw == null) {
            throw new BusinessException(ErrorCode.SPRINT_INVALID_STAGE);
        }
        try {
            return SprintStage.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.SPRINT_INVALID_STAGE);
        }
    }

    private SprintResponse.Board buildBoard(Milestone milestone) {
        String milestoneId = milestone.getId();
        List<Sprint> sprints = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestoneId);

        // 가장 최근 활성 스프린트 (동시에 1개 원칙, 방어적으로 최대 seq 선택)
        Sprint active = null;
        for (Sprint s : sprints) {
            if (s.isActive()) {
                active = s;
            }
        }

        // 타임라인: 활성=라이브 집계, 아카이브=동결 수치
        List<SprintResponse.SprintInfo> timeline = new ArrayList<>();
        for (Sprint s : sprints) {
            int pct;
            if (s.isActive()) {
                int total = checklistItemRepository.countBySprintId(s.getId());
                int done = checklistItemRepository.countBySprintIdAndStage(s.getId(), SprintStage.DONE);
                pct = total > 0 ? Math.round(done * 100f / total) : 0;
            } else {
                pct = s.getTotalCount() > 0 ? Math.round(s.getCompletedCount() * 100f / s.getTotalCount()) : 0;
            }
            timeline.add(SprintResponse.SprintInfo.of(s, pct));
        }

        SprintResponse.SprintInfo activeInfo = null;
        SprintResponse.Columns columns = SprintResponse.Columns.builder()
                .sprint(List.of()).review(List.of()).done(List.of()).build();
        SprintResponse.Gauge gauge = SprintResponse.Gauge.of(0, 0);

        if (active != null) {
            List<ChecklistItem> items = checklistItemRepository.findBySprintId(active.getId());
            List<SprintResponse.ItemCard> sprintCol = new ArrayList<>();
            List<SprintResponse.ItemCard> reviewCol = new ArrayList<>();
            List<SprintResponse.ItemCard> doneCol = new ArrayList<>();
            for (ChecklistItem c : items) {
                SprintResponse.ItemCard card = SprintResponse.ItemCard.of(c);
                SprintStage st = c.getSprintStage();
                if (st == SprintStage.DONE) {
                    doneCol.add(card);
                } else if (st == SprintStage.REVIEW) {
                    reviewCol.add(card);
                } else {
                    sprintCol.add(card);
                }
            }
            columns = SprintResponse.Columns.builder()
                    .sprint(sprintCol).review(reviewCol).done(doneCol).build();
            gauge = SprintResponse.Gauge.of(doneCol.size(), items.size());
            activeInfo = SprintResponse.SprintInfo.of(active, gauge.getPercentage());
        }

        List<SprintResponse.ItemCard> backlog = checklistItemRepository.findBacklogByMilestoneId(milestoneId)
                .stream().map(SprintResponse.ItemCard::of).toList();

        return SprintResponse.Board.builder()
                .sprintEnabled(Boolean.TRUE.equals(milestone.getSprintEnabled()))
                .activeSprint(activeInfo)
                .sprints(timeline)
                .gauge(gauge)
                .columns(columns)
                .backlog(backlog)
                .build();
    }
}
