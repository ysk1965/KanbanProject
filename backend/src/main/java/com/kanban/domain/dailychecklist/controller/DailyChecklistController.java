package com.kanban.domain.dailychecklist.controller;

import com.kanban.domain.dailychecklist.dto.DailyChecklistRequest;
import com.kanban.domain.dailychecklist.dto.DailyChecklistResponse;
import com.kanban.domain.dailychecklist.service.DailyChecklistService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/daily-checklists")
@RequiredArgsConstructor
public class DailyChecklistController {

    private final DailyChecklistService dailyChecklistService;

    /**
     * 데일리 체크리스트 조회
     * GET /api/v1/boards/{boardId}/daily-checklists?date={date}
     */
    @GetMapping
    public ResponseEntity<DailyChecklistResponse.ListResponse> getDailyChecklist(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @AuthenticationPrincipal UserPrincipal principal) {
        DailyChecklistResponse.ListResponse response = dailyChecklistService.getDailyChecklist(
                boardId, date, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    /**
     * 기존 체크리스트 아이템을 데일리 체크리스트에 추가
     * POST /api/v1/boards/{boardId}/daily-checklists
     */
    @PostMapping
    public ResponseEntity<DailyChecklistResponse.ItemResponse> addItem(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DailyChecklistRequest.Create request) {
        DailyChecklistResponse.ItemResponse response = dailyChecklistService.addItem(
                boardId, request, principal.getUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * 새 체크리스트 아이템을 생성하면서 데일리 체크리스트에 추가
     * POST /api/v1/boards/{boardId}/daily-checklists/with-item
     */
    @PostMapping("/with-item")
    public ResponseEntity<DailyChecklistResponse.ItemResponse> addWithNewItem(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DailyChecklistRequest.CreateWithItem request) {
        DailyChecklistResponse.ItemResponse response = dailyChecklistService.addWithNewItem(
                boardId, request, principal.getUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * 데일리 체크리스트 아이템 순서 변경
     * PUT /api/v1/boards/{boardId}/daily-checklists/{itemId}/position
     */
    @PutMapping("/{itemId}/position")
    public ResponseEntity<DailyChecklistResponse.ItemResponse> updatePosition(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DailyChecklistRequest.UpdatePosition request) {
        DailyChecklistResponse.ItemResponse response = dailyChecklistService.updatePosition(
                boardId, itemId, request, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    /**
     * 데일리 체크리스트 아이템 삭제
     * DELETE /api/v1/boards/{boardId}/daily-checklists/{itemId}
     */
    @DeleteMapping("/{itemId}")
    public ResponseEntity<Map<String, String>> removeItem(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        dailyChecklistService.removeItem(boardId, itemId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "데일리 체크리스트 항목이 삭제되었습니다"));
    }
}
