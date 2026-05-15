package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteRequest;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.OrgNoteService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/notes")
@RequiredArgsConstructor
public class OrgNoteController {

    private final OrgNoteService orgNoteService;

    @GetMapping
    public ResponseEntity<List<NoteResponse.TreeItem>> getNoteTree(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getNoteTree(orgId, principal.getUserId()));
    }

    @GetMapping("/list")
    public ResponseEntity<List<NoteResponse.ListItem>> getNoteList(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getNoteList(orgId, principal.getUserId()));
    }

    @GetMapping("/board-notes")
    public ResponseEntity<List<NoteResponse.BoardNoteSection>> getBoardNotes(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getBoardNotes(orgId, principal.getUserId()));
    }

    @GetMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> getNoteDetail(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getNoteDetail(orgId, noteId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteResponse.Detail> createNote(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgNoteService.createNote(orgId, principal.getUserId(), request));
    }

    @PutMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> updateNote(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "true") boolean createVersion,
            @Valid @RequestBody NoteRequest.Update request) {
        return ResponseEntity.ok(orgNoteService.updateNote(
                orgId, noteId, principal.getUserId(), request, createVersion));
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Map<String, String>> deleteNote(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgNoteService.deleteNote(orgId, noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트가 삭제되었습니다"));
    }

    @PutMapping("/{noteId}/move")
    public ResponseEntity<NoteResponse.Detail> moveNote(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Move request) {
        return ResponseEntity.ok(orgNoteService.moveNote(orgId, noteId, principal.getUserId(), request));
    }

    // ===== Versions =====

    @GetMapping("/{noteId}/versions")
    public ResponseEntity<List<NoteResponse.VersionInfo>> getVersions(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getVersions(orgId, noteId, principal.getUserId()));
    }

    @GetMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<NoteResponse.VersionDetail> getVersionDetail(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.getVersionDetail(orgId, noteId, versionId, principal.getUserId()));
    }

    @PostMapping("/{noteId}/versions/{versionId}/restore")
    public ResponseEntity<NoteResponse.Detail> restoreVersion(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.restoreVersion(orgId, noteId, versionId, principal.getUserId()));
    }

    @DeleteMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<Void> deleteVersion(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgNoteService.deleteVersion(orgId, noteId, versionId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{noteId}/versions")
    public ResponseEntity<Void> deleteAllVersions(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgNoteService.deleteAllVersions(orgId, noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ===== Sharing =====

    @PostMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> enableShare(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.enableShare(orgId, noteId, principal.getUserId()));
    }

    @DeleteMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> disableShare(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteService.disableShare(orgId, noteId, principal.getUserId()));
    }
}
