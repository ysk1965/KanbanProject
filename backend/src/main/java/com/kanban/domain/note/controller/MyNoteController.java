package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteRequest;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.MyNoteService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 개인(마이 스페이스) 노트 API. {@link OrgNoteController} 의 owner-scope 미러.
 * 스코프는 JWT 의 현재 사용자로 암묵 결정된다 (경로에 scope id 없음).
 */
@RestController
@RequestMapping("/api/v1/me/notes")
@RequiredArgsConstructor
public class MyNoteController {

    private final MyNoteService myNoteService;

    @GetMapping
    public ResponseEntity<List<NoteResponse.TreeItem>> getNoteTree(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getNoteTree(principal.getUserId()));
    }

    @GetMapping("/list")
    public ResponseEntity<List<NoteResponse.ListItem>> getNoteList(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getNoteList(principal.getUserId()));
    }

    @GetMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> getNoteDetail(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getNoteDetail(noteId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteResponse.Detail> createNote(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(myNoteService.createNote(principal.getUserId(), request));
    }

    @PutMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> updateNote(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "true") boolean createVersion,
            @Valid @RequestBody NoteRequest.Update request) {
        return ResponseEntity.ok(myNoteService.updateNote(
                noteId, principal.getUserId(), request, createVersion));
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Map<String, String>> deleteNote(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.deleteNote(noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트가 삭제되었습니다"));
    }

    @PutMapping("/{noteId}/move")
    public ResponseEntity<NoteResponse.Detail> moveNote(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Move request) {
        return ResponseEntity.ok(myNoteService.moveNote(noteId, principal.getUserId(), request));
    }

    // ===== Trash =====

    @GetMapping("/trash")
    public ResponseEntity<List<NoteResponse.TrashItem>> getTrash(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getTrash(principal.getUserId()));
    }

    @PostMapping("/{noteId}/restore")
    public ResponseEntity<NoteResponse.Detail> restoreNote(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.restoreNote(noteId, principal.getUserId()));
    }

    @DeleteMapping("/{noteId}/permanent")
    public ResponseEntity<Map<String, String>> permanentDeleteNote(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.permanentDeleteNote(noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Map<String, Object>> emptyTrash(
            @AuthenticationPrincipal UserPrincipal principal) {
        int deleted = myNoteService.emptyTrash(principal.getUserId());
        return ResponseEntity.ok(Map.of("deleted_count", deleted));
    }

    // ===== Versions =====

    @GetMapping("/{noteId}/versions")
    public ResponseEntity<List<NoteResponse.VersionInfo>> getVersions(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getVersions(noteId, principal.getUserId()));
    }

    @GetMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<NoteResponse.VersionDetail> getVersionDetail(
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.getVersionDetail(noteId, versionId, principal.getUserId()));
    }

    @PostMapping("/{noteId}/versions/{versionId}/restore")
    public ResponseEntity<NoteResponse.Detail> restoreVersion(
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) @Valid NoteRequest.RestoreVersion request) {
        return ResponseEntity.ok(myNoteService.restoreVersion(noteId, versionId, principal.getUserId(), request));
    }

    @DeleteMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<Void> deleteVersion(
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.deleteVersion(noteId, versionId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{noteId}/versions")
    public ResponseEntity<Void> deleteAllVersions(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.deleteAllVersions(noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{noteId}/draft")
    public ResponseEntity<Void> discardDraft(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.discardDraft(noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{noteId}/draft/restore")
    public ResponseEntity<Void> restoreDraft(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteService.restoreDraft(noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{noteId}/draft/archived")
    public ResponseEntity<Map<String, Boolean>> hasArchivedDraft(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean available = myNoteService.hasArchivedDraft(noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("available", available));
    }

    // ===== Sharing =====

    @PostMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> enableShare(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.enableShare(noteId, principal.getUserId()));
    }

    @DeleteMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> disableShare(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.disableShare(noteId, principal.getUserId()));
    }

    @PostMapping("/{noteId}/share/rotate")
    public ResponseEntity<NoteResponse.Detail> rotateShareToken(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.rotateShareToken(noteId, principal.getUserId()));
    }

    // ===== Like =====

    @PostMapping("/{noteId}/like/toggle")
    public ResponseEntity<NoteResponse.Detail> toggleLike(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteService.toggleLike(noteId, principal.getUserId()));
    }
}
