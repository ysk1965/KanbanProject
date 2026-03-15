package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.OrgNoteService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/note-tags")
@RequiredArgsConstructor
public class OrgNoteTagController {

    private final OrgNoteService orgNoteService;

    @GetMapping
    public ResponseEntity<List<NoteResponse.TagInfo>> getTags(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getTags(orgId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteResponse.TagInfo> createTag(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgNoteService.createTag(orgId, principal.getUserId(), body.get("name"), body.get("color")));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Map<String, String>> deleteTag(
            @PathVariable String orgId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgNoteService.deleteTag(orgId, tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 삭제되었습니다"));
    }
}
