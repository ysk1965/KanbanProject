package com.kanban.domain.meeting.controller;

import com.kanban.domain.meeting.dto.MeetingAIRequest;
import com.kanban.domain.meeting.dto.MeetingAIResponse;
import com.kanban.domain.meeting.dto.MeetingRequest;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.meeting.service.MeetingAIService;
import com.kanban.domain.meeting.service.MeetingService;
import com.kanban.domain.meeting.service.MeetingTranscriptionService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/meetings")
@RequiredArgsConstructor
public class MeetingController {

    private final MeetingService meetingService;
    private final MeetingAIService meetingAIService;
    private final MeetingTranscriptionService meetingTranscriptionService;

    @GetMapping
    public ResponseEntity<List<MeetingResponse.Summary>> getMeetingsByDate(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<MeetingResponse.Summary> response = meetingService.getMeetingsByDate(
                boardId, date, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{meetingId}")
    public ResponseEntity<MeetingResponse.Detail> getMeetingDetail(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal) {
        MeetingResponse.Detail response = meetingService.getMeetingDetail(
                boardId, meetingId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<MeetingResponse.Detail> createMeeting(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MeetingRequest.Create request) {
        MeetingResponse.Detail response = meetingService.createMeeting(
                boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{meetingId}")
    public ResponseEntity<MeetingResponse.Detail> updateMeeting(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MeetingRequest.Update request) {
        MeetingResponse.Detail response = meetingService.updateMeeting(
                boardId, meetingId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{meetingId}")
    public ResponseEntity<Map<String, String>> deleteMeeting(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal) {
        meetingService.deleteMeeting(boardId, meetingId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "회의가 삭제되었습니다"));
    }

    @PostMapping("/{meetingId}/notify")
    public ResponseEntity<Map<String, String>> notifyParticipants(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal) {
        meetingService.notifyParticipants(boardId, meetingId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "회의록 알림을 보냈습니다"));
    }

    @PostMapping("/{meetingId}/transcribe")
    public ResponseEntity<MeetingResponse.TranscriptResult> transcribeAudio(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestPart("file") MultipartFile audioFile) {
        MeetingResponse.TranscriptResult result =
                meetingTranscriptionService.transcribeAudio(
                        boardId, meetingId, principal.getUserId(), audioFile);
        return ResponseEntity.ok(result);
    }

    @PutMapping("/{meetingId}/transcript")
    public ResponseEntity<MeetingResponse.TranscriptResult> updateTranscript(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body) {
        MeetingResponse.TranscriptResult result =
                meetingService.updateTranscript(
                        boardId, meetingId, principal.getUserId(),
                        body.get("transcript"));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{meetingId}/ai-organize")
    public ResponseEntity<MeetingAIResponse.Suggestions> aiOrganize(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @RequestParam(required = false) String language,
            @AuthenticationPrincipal UserPrincipal principal) {
        MeetingAIResponse.Suggestions response = meetingAIService.generateSuggestions(
                boardId, meetingId, principal.getUserId(), language);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{meetingId}/ai-apply")
    public ResponseEntity<MeetingAIResponse.ApplyResult> aiApply(
            @PathVariable String boardId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MeetingAIRequest.Apply request) {
        MeetingAIResponse.ApplyResult response = meetingAIService.applySuggestions(
                boardId, meetingId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
