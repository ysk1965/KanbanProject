package com.kanban.domain.statistics.controller;

import com.kanban.domain.statistics.dto.ManagementResponse;
import com.kanban.domain.statistics.dto.StatisticsResponse;
import com.kanban.domain.statistics.service.ManagementService;
import com.kanban.domain.statistics.service.StatisticsService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/boards/{boardId}")
@RequiredArgsConstructor
public class StatisticsController {

    private final StatisticsService statisticsService;
    private final ManagementService managementService;

    @GetMapping("/statistics")
    public ResponseEntity<StatisticsResponse.BoardStatistics> getBoardStatistics(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start_date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end_date,
            @RequestParam(required = false) List<String> milestone_ids,
            @RequestParam(required = false) List<String> feature_ids,
            @RequestParam(required = false) List<String> member_ids,
            @RequestParam(required = false) List<String> tag_ids
    ) {
        String userId = principal.getUserId();
        log.info("Getting board statistics for board: {}, user: {}", boardId, userId);
        StatisticsResponse.BoardStatistics statistics = statisticsService.getBoardStatistics(
                boardId, userId, start_date, end_date, milestone_ids, feature_ids, member_ids, tag_ids
        );
        return ResponseEntity.ok(statistics);
    }

    @GetMapping("/statistics/personal")
    public ResponseEntity<StatisticsResponse.PersonalStatistics> getPersonalStatistics(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start_date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end_date
    ) {
        String userId = principal.getUserId();
        log.info("Getting personal statistics for board: {}, user: {}", boardId, userId);
        StatisticsResponse.PersonalStatistics statistics = statisticsService.getPersonalStatistics(
                boardId, userId, start_date, end_date
        );
        return ResponseEntity.ok(statistics);
    }

    /**
     * 관리 대시보드 통계 조회
     * - 마일스톤 헬스 체크 (진행률, 예상 완료일, 상태, 번다운 차트)
     * - 팀원별 생산성 추적
     * - 지연 항목 식별 (마감 초과, 정체 Task, 막힌 체크리스트)
     */
    @GetMapping("/statistics/management")
    public ResponseEntity<ManagementResponse.ManagementStatistics> getManagementStatistics(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String milestone_id,
            @RequestParam(required = false, defaultValue = "3") int stagnant_task_days,
            @RequestParam(required = false, defaultValue = "2") int stuck_checklist_days
    ) {
        String userId = principal.getUserId();
        log.info("Getting management statistics for board: {}, user: {}, milestone: {}",
                boardId, userId, milestone_id);

        ManagementResponse.ManagementStatistics statistics = managementService.getManagementStatistics(
                boardId, userId, milestone_id, stagnant_task_days, stuck_checklist_days
        );
        return ResponseEntity.ok(statistics);
    }
}
