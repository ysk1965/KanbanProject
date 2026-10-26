package com.kanban.domain.sermonnote.controller;

import com.kanban.domain.sermonnote.dto.SermonNoteVersionDto;
import com.kanban.domain.sermonnote.service.SermonNoteVersionService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 노트 버전 기록. 계약서: docs/Tech/sermon-note-versions-api.md */
@RestController
@RequestMapping("/api/v1/sermon-notes/{noteId}/versions")
@RequiredArgsConstructor
public class SermonNoteVersionController {

    private final SermonNoteVersionService versionService;

    @GetMapping
    public ResponseEntity<SermonNoteVersionDto.Items> list(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String noteId) {
        return ResponseEntity.ok(versionService.list(principal.getUserId(), noteId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SermonNoteVersionDto.Item> get(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String noteId, @PathVariable String id) {
        return ResponseEntity.ok(versionService.get(principal.getUserId(), noteId, id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SermonNoteVersionDto.Item> put(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String noteId,
            @PathVariable String id,
            @RequestBody(required = false) SermonNoteVersionDto.Put request) {
        return ResponseEntity.ok(versionService.put(principal.getUserId(), noteId, id, request));
    }
}
