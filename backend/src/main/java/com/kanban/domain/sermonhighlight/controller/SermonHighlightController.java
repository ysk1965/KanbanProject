package com.kanban.domain.sermonhighlight.controller;

import com.kanban.domain.sermonhighlight.dto.SermonHighlightDto;
import com.kanban.domain.sermonhighlight.service.SermonHighlightService;
import com.kanban.global.security.UserPrincipal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 성경 읽기 「형광펜」. 계약서: docs/Tech/sermon-highlight-api.md */
@RestController
@RequestMapping("/api/v1/sermon-highlights")
@RequiredArgsConstructor
public class SermonHighlightController {

    private final SermonHighlightService highlightService;

    @GetMapping
    public ResponseEntity<List<SermonHighlightDto.Item>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(highlightService.list(principal.getUserId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SermonHighlightDto.Item> upsert(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id,
            @RequestBody SermonHighlightDto.Upsert request) {
        return ResponseEntity.ok(highlightService.upsert(principal.getUserId(), id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String id) {
        highlightService.delete(principal.getUserId(), id);
        return ResponseEntity.noContent().build();
    }
}
