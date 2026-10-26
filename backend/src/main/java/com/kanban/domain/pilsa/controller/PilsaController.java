package com.kanban.domain.pilsa.controller;

import com.kanban.domain.pilsa.dto.PilsaDto;
import com.kanban.domain.pilsa.service.PilsaService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 노트 챌린지 — 이번 주 말씀 필사. 계약서: docs/Tech/sermon-pilsa-api.md */
@RestController
@RequestMapping("/api/v1/challenge/pilsa")
@RequiredArgsConstructor
public class PilsaController {

    private final PilsaService pilsaService;

    @GetMapping("/week")
    public ResponseEntity<PilsaDto.Week> week(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(pilsaService.week(principal.getUserId()));
    }

    @PutMapping("/week")
    public ResponseEntity<PilsaDto.Week> putWeek(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody PilsaDto.PutWeek request) {
        return ResponseEntity.ok(pilsaService.putWeek(principal.getUserId(), request));
    }

    @PostMapping("/verses")
    public ResponseEntity<PilsaDto.VerseResult> writeVerse(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody PilsaDto.VerseIn request) {
        return ResponseEntity.ok(pilsaService.writeVerse(principal.getUserId(), request));
    }
}
