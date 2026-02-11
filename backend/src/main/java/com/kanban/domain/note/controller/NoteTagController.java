package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.NoteService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/note-tags")
@RequiredArgsConstructor
public class NoteTagController {

    private final NoteService noteService;

    @GetMapping
    public ResponseEntity<List<NoteResponse.TagInfo>> getTags(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<NoteResponse.TagInfo> tags = noteService.getTags(boardId, principal.getUserId());
        return ResponseEntity.ok(tags);
    }

    @PostMapping
    public ResponseEntity<NoteResponse.TagInfo> createTag(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        NoteResponse.TagInfo tag = noteService.createTag(
                boardId, principal.getUserId(),
                body.get("name"), body.get("color"));
        return ResponseEntity.status(HttpStatus.CREATED).body(tag);
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Map<String, String>> deleteTag(
            @PathVariable String boardId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.deleteTag(boardId, tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 삭제되었습니다"));
    }
}
