package com.kanban.domain.statistics.controller;

import com.kanban.domain.statistics.dto.StatisticsResponse;
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
}
