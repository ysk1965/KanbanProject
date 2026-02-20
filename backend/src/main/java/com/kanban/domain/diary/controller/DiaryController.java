package com.kanban.domain.diary.controller;

import com.kanban.domain.diary.dto.DiaryRequest;
import com.kanban.domain.diary.dto.DiaryResponse;
import com.kanban.domain.diary.service.DiaryService;
import com.kanban.domain.diary.service.DiaryVoiceService;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.subscription.service.AiCreditService;
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
@RequestMapping("/api/v1/diary")
@RequiredArgsConstructor
public class DiaryController {

    private final DiaryService diaryService;
    private final DiaryVoiceService diaryVoiceService;
    private final AiCreditService aiCreditService;

    @GetMapping("/credits")
    public ResponseEntity<AiCreditResponse.CreditInfo> getPersonalCredits(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(aiCreditService.getUserCredits(principal.getUserId()));
    }

    @GetMapping
    public ResponseEntity<DiaryResponse.Detail> getDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        DiaryResponse.Detail response = diaryService.getDiary(principal.getUserId(), date);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{diaryId}")
    public ResponseEntity<DiaryResponse.Detail> getDiaryById(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId) {
        DiaryResponse.Detail response = diaryService.getDiaryById(principal.getUserId(), diaryId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/list")
    public ResponseEntity<List<DiaryResponse.Simple>> getDiaryList(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam int year,
            @RequestParam int month) {
        List<DiaryResponse.Simple> response = diaryService.getDiaryList(principal.getUserId(), year, month);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<DiaryResponse.Detail> createDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DiaryRequest.Create request) {
        DiaryResponse.Detail response = diaryService.createDiary(principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/{diaryId}/messages")
    public ResponseEntity<DiaryResponse.AiReply> sendMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @Valid @RequestBody DiaryRequest.SendMessage request) {
        DiaryResponse.AiReply response = diaryService.sendMessage(principal.getUserId(), diaryId, request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{diaryId}/complete")
    public ResponseEntity<DiaryResponse.Detail> completeDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @Valid @RequestBody DiaryRequest.Complete request) {
        DiaryResponse.Detail response = diaryService.completeDiary(principal.getUserId(), diaryId, request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{diaryId}/reopen")
    public ResponseEntity<DiaryResponse.Detail> reopenDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId) {
        DiaryResponse.Detail response = diaryService.reopenDiary(principal.getUserId(), diaryId);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{diaryId}/reset")
    public ResponseEntity<DiaryResponse.Detail> resetDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId) {
        DiaryResponse.Detail response = diaryService.resetDiary(principal.getUserId(), diaryId);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{diaryId}")
    public ResponseEntity<DiaryResponse.Detail> updateDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @Valid @RequestBody DiaryRequest.Update request) {
        DiaryResponse.Detail response = diaryService.updateDiary(principal.getUserId(), diaryId, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/transcribe")
    public ResponseEntity<Map<String, String>> transcribeVoice(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") MultipartFile audioFile) {
        String text = diaryVoiceService.transcribe(audioFile);
        return ResponseEntity.ok(Map.of("text", text));
    }

    @DeleteMapping("/{diaryId}")
    public ResponseEntity<Map<String, String>> deleteDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId) {
        diaryService.deleteDiary(principal.getUserId(), diaryId);
        return ResponseEntity.ok(Map.of("message", "일기가 삭제되었습니다"));
    }
}
