package com.kanban.domain.contractor.controller;

import com.kanban.domain.contractor.dto.BoardContractorRequest;
import com.kanban.domain.contractor.dto.BoardContractorResponse;
import com.kanban.domain.contractor.service.BoardContractorService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/contractors")
@RequiredArgsConstructor
public class BoardContractorController {

    private final BoardContractorService contractorService;

    @GetMapping
    public ResponseEntity<BoardContractorResponse.ListResponse> list(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(contractorService.list(boardId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<BoardContractorResponse.Detail> create(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.Create request) {
        BoardContractorResponse.Detail response = contractorService.create(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{contractorId}")
    public ResponseEntity<BoardContractorResponse.Detail> update(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.Update request) {
        return ResponseEntity.ok(contractorService.update(boardId, contractorId, principal.getUserId(), request));
    }

    @DeleteMapping("/{contractorId}")
    public ResponseEntity<Map<String, String>> delete(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @AuthenticationPrincipal UserPrincipal principal) {
        contractorService.delete(boardId, contractorId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "외주가 삭제되었습니다"));
    }

    @PutMapping("/{contractorId}/visibility")
    public ResponseEntity<BoardContractorResponse.Detail> setVisibility(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.Visibility request) {
        return ResponseEntity.ok(contractorService.setHidden(boardId, contractorId, principal.getUserId(), request));
    }

    @PutMapping("/reorder")
    public ResponseEntity<BoardContractorResponse.ListResponse> reorder(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.Reorder request) {
        return ResponseEntity.ok(contractorService.reorder(boardId, principal.getUserId(), request));
    }

    // ─── 계약 기간(periods) 관리 (갱신/연장) ───

    @PostMapping("/{contractorId}/periods")
    public ResponseEntity<BoardContractorResponse.Detail> addPeriod(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.PeriodCreate request) {
        BoardContractorResponse.Detail response =
                contractorService.addPeriod(boardId, contractorId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{contractorId}/periods/{periodId}")
    public ResponseEntity<BoardContractorResponse.Detail> updatePeriod(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @PathVariable String periodId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardContractorRequest.PeriodUpdate request) {
        return ResponseEntity.ok(
                contractorService.updatePeriod(boardId, contractorId, periodId, principal.getUserId(), request));
    }

    @DeleteMapping("/{contractorId}/periods/{periodId}")
    public ResponseEntity<BoardContractorResponse.Detail> deletePeriod(
            @PathVariable String boardId,
            @PathVariable String contractorId,
            @PathVariable String periodId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                contractorService.deletePeriod(boardId, contractorId, periodId, principal.getUserId()));
    }
}
