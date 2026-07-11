package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.MyNoteService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 개인 노트 태그 API. {@link OrgNoteTagController} 의 owner-scope 미러.
 */
@RestController
@RequestMapping("/api/v1/me/note-tags")
@RequiredArgsConstructor
public class MyNoteTagController {

    private final MyNoteService myNoteService;

    @GetMapping
    public ResponseEntity<List<NoteResponse.TagInfo>> getTags(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getTags(principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteResponse.TagInfo> createTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(myNoteService.createTag(principal.getUserId(), body.get("name"), body.get("color")));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Map<String, String>> deleteTag(
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.deleteTag(tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 삭제되었습니다"));
    }
}
