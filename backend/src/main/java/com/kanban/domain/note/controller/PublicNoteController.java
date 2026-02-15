package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.NoteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public/notes")
@RequiredArgsConstructor
public class PublicNoteController {

    private final NoteService noteService;

    @GetMapping("/{shareToken}")
    public ResponseEntity<NoteResponse.SharedNote> getSharedNote(
            @PathVariable String shareToken) {
        NoteResponse.SharedNote sharedNote = noteService.getSharedNote(shareToken);
        return ResponseEntity.ok(sharedNote);
    }
}
