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
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/daily-checklists")
@RequiredArgsConstructor
public class DailyChecklistController {

    private final DailyChecklistService dailyChecklistService;

    /**
     * 타임블록 모달용 통합 데이터 조회
     * GET /api/v1/boards/{boardId}/daily-checklists/timeblock-data?date={date}&assigneeId={assigneeId}
     */
    @GetMapping("/timeblock-data")
    public ResponseEntity<DailyChecklistResponse.TimeblockDataResponse> getTimeblockData(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam String assigneeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DailyChecklistResponse.TimeblockDataResponse response = dailyChecklistService.getTimeblockData(
                boardId, date, assigneeId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    /**
     * 날짜 범위 내 데일리 체크리스트 조회 (캘린더용)
     * GET /api/v1/boards/{boardId}/daily-checklists/range?startDate={startDate}&endDate={endDate}&assigneeId={assigneeId}
     */
    @GetMapping("/range")
    public ResponseEntity<List<DailyChecklistResponse.ItemResponse>> getChecklistItemsInRange(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam String assigneeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<DailyChecklistResponse.ItemResponse> response = dailyChecklistService.getChecklistItemsInRange(
                boardId, startDate, endDate, assigneeId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

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
     * 오늘의 체크리스트에서 항목 빼기 (원본 체크리스트는 유지)
     * POST /api/v1/boards/{boardId}/daily-checklists/exclude
     *
     * <p>기간 때문에 자동으로 들어온 항목은 행을 지워도 다시 나타나므로 이 엔드포인트를 쓴다.
     * 원본 체크리스트가 연결된 항목이라면 항상 이 경로로 제거한다.</p>
     */
    @PostMapping("/exclude")
    public ResponseEntity<Map<String, String>> excludeItem(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DailyChecklistRequest.Exclude request) {
        dailyChecklistService.excludeItem(boardId, request, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "오늘의 체크리스트에서 제외되었습니다"));
    }

    /**
     * 데일리 체크리스트 아이템 삭제 (임시 항목) / 제외 (원본 연결 항목)
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
