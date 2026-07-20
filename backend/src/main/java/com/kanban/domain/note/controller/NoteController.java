package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteAIRequest;
import com.kanban.domain.note.dto.NoteAIResponse;
import com.kanban.domain.note.dto.NoteRequest;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.NoteAIService;
import com.kanban.domain.note.service.NoteService;
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
@RequestMapping("/api/v1/boards/{boardId}/notes")
@RequiredArgsConstructor
public class NoteController {

    private final NoteService noteService;
    private final NoteAIService noteAIService;

    // ===== Note CRUD =====

    @GetMapping
    public ResponseEntity<List<NoteResponse.TreeItem>> getNoteTree(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<NoteResponse.TreeItem> tree = noteService.getNoteTree(boardId, principal.getUserId());
        return ResponseEntity.ok(tree);
    }

    @GetMapping("/list")
    public ResponseEntity<List<NoteResponse.ListItem>> getNoteList(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<NoteResponse.ListItem> list = noteService.getNoteList(boardId, principal.getUserId());
        return ResponseEntity.ok(list);
    }

    @GetMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> getNoteDetail(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteResponse.Detail detail = noteService.getNoteDetail(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(detail);
    }

    @PostMapping
    public ResponseEntity<NoteResponse.Detail> createNote(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Create request) {
        NoteResponse.Detail created = noteService.createNote(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{noteId}")
    public ResponseEntity<NoteResponse.Detail> updateNote(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "true") boolean createVersion,
            @RequestParam(defaultValue = "true") boolean discardDraft,
            @Valid @RequestBody NoteRequest.Update request) {
        NoteResponse.Detail updated = noteService.updateNote(
                boardId, noteId, principal.getUserId(), request, createVersion, discardDraft);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{noteId}")
    public ResponseEntity<Map<String, String>> deleteNote(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.deleteNote(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트가 삭제되었습니다"));
    }

    @PutMapping("/{noteId}/move")
    public ResponseEntity<NoteResponse.Detail> moveNote(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteRequest.Move request) {
        NoteResponse.Detail moved = noteService.moveNote(boardId, noteId, principal.getUserId(), request);
        return ResponseEntity.ok(moved);
    }

    // ===== Trash =====

    @GetMapping("/trash")
    public ResponseEntity<List<NoteResponse.TrashItem>> getTrash(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.getTrash(boardId, principal.getUserId()));
    }

    @PostMapping("/{noteId}/restore")
    public ResponseEntity<NoteResponse.Detail> restoreNote(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.restoreNote(boardId, noteId, principal.getUserId()));
    }

    @DeleteMapping("/{noteId}/permanent")
    public ResponseEntity<Map<String, String>> permanentDeleteNote(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.permanentDeleteNote(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Map<String, Object>> emptyTrash(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        int deleted = noteService.emptyTrash(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("deleted_count", deleted));
    }

    // ===== Versions =====

    @GetMapping("/{noteId}/versions")
    public ResponseEntity<List<NoteResponse.VersionInfo>> getVersions(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<NoteResponse.VersionInfo> versions = noteService.getVersions(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(versions);
    }

    @GetMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<NoteResponse.VersionDetail> getVersionDetail(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteResponse.VersionDetail detail = noteService.getVersionDetail(boardId, noteId, versionId, principal.getUserId());
        return ResponseEntity.ok(detail);
    }

    @PostMapping("/{noteId}/versions/{versionId}/restore")
    public ResponseEntity<NoteResponse.Detail> restoreVersion(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) @Valid NoteRequest.RestoreVersion request) {
        NoteResponse.Detail restored = noteService.restoreVersion(boardId, noteId, versionId, principal.getUserId(), request);
        return ResponseEntity.ok(restored);
    }

    @DeleteMapping("/{noteId}/versions/{versionId}")
    public ResponseEntity<Void> deleteVersion(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String versionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.deleteVersion(boardId, noteId, versionId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{noteId}/versions")
    public ResponseEntity<Void> deleteAllVersions(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.deleteAllVersions(boardId, noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{noteId}/draft")
    public ResponseEntity<Void> discardDraft(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.discardDraft(boardId, noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /** Restore a previously discarded draft (되돌리기). */
    @PostMapping("/{noteId}/draft/restore")
    public ResponseEntity<Void> restoreDraft(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteService.restoreDraft(boardId, noteId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /** Whether a restorable discarded draft exists for this note. */
    @GetMapping("/{noteId}/draft/archived")
    public ResponseEntity<Map<String, Boolean>> hasArchivedDraft(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean available = noteService.hasArchivedDraft(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("available", available));
    }

    // ===== Sharing =====

    @PostMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> enableShare(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteResponse.Detail detail = noteService.enableShare(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(detail);
    }

    @DeleteMapping("/{noteId}/share")
    public ResponseEntity<NoteResponse.Detail> disableShare(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteResponse.Detail detail = noteService.disableShare(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(detail);
    }

    @PostMapping("/{noteId}/share/rotate")
    public ResponseEntity<NoteResponse.Detail> rotateShareToken(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteResponse.Detail detail = noteService.rotateShareToken(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(detail);
    }

    // ===== AI Organize =====

    @PostMapping("/{noteId}/ai-organize")
    public ResponseEntity<NoteAIResponse.Suggestions> aiOrganize(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @RequestParam(required = false) String language,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteAIResponse.Suggestions response = noteAIService.generateSuggestions(
                boardId, noteId, principal.getUserId(), language);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{noteId}/ai-apply")
    public ResponseEntity<NoteAIResponse.ApplyResult> aiApply(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteAIRequest.Apply request) {
        NoteAIResponse.ApplyResult response = noteAIService.applySuggestions(
                boardId, noteId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // ===== Like =====

    @PostMapping("/{noteId}/like/toggle")
    public ResponseEntity<NoteResponse.Detail> toggleLike(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(noteService.toggleLike(boardId, noteId, principal.getUserId()));
    }
}
