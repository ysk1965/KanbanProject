package com.kanban.domain.diary.controller;

import com.kanban.domain.diary.DiaryVoiceSettings;
import com.kanban.domain.diary.dto.DiaryRequest;
import com.kanban.domain.diary.dto.DiaryResponse;
import com.kanban.domain.diary.dto.DiaryWorkContextResponse;
import com.kanban.domain.diary.service.DiaryService;
import com.kanban.domain.diary.service.DiaryVoiceService;
import com.kanban.domain.diary.service.DiaryWorkContextService;
import com.kanban.domain.subscription.dto.AiCreditRequest;
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

import java.math.BigDecimal;
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
    private final DiaryWorkContextService diaryWorkContextService;

    @GetMapping("/credits")
    public ResponseEntity<AiCreditResponse.CreditInfo> getPersonalCredits(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(aiCreditService.getUserCredits(principal.getUserId()));
    }

    @PostMapping("/credits/purchase")
    public ResponseEntity<AiCreditResponse.PurchaseResult> purchasePersonalCredits(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AiCreditRequest.Purchase request) {
        AiCreditResponse.PurchaseResult result = aiCreditService.purchasePersonalCredits(
                principal.getUserId(), request);
        return ResponseEntity.ok(result);
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
            @Valid @RequestBody DiaryRequest.Create request,
            @RequestParam(required = false) String language) {
        DiaryResponse.Detail response = diaryService.createDiary(principal.getUserId(), request, language);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/{diaryId}/messages")
    public ResponseEntity<DiaryResponse.AiReply> sendMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @Valid @RequestBody DiaryRequest.SendMessage request,
            @RequestParam(required = false) String language) {
        DiaryResponse.AiReply response = diaryService.sendMessage(principal.getUserId(), diaryId, request, language);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{diaryId}/complete")
    public ResponseEntity<DiaryResponse.Detail> completeDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @Valid @RequestBody DiaryRequest.Complete request,
            @RequestParam(required = false) String language) {
        DiaryResponse.Detail response = diaryService.completeDiary(principal.getUserId(), diaryId, request, language);
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
            @PathVariable String diaryId,
            @RequestParam(required = false) String language) {
        DiaryResponse.Detail response = diaryService.resetDiary(principal.getUserId(), diaryId, language);
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

    @DeleteMapping("/{diaryId}")
    public ResponseEntity<Map<String, String>> deleteDiary(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId) {
        diaryService.deleteDiary(principal.getUserId(), diaryId);
        return ResponseEntity.ok(Map.of("message", "일기가 삭제되었습니다"));
    }

    // ============================
    // Work Context Endpoint
    // ============================

    @GetMapping("/work-context")
    public ResponseEntity<DiaryWorkContextResponse> getWorkContext(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(diaryWorkContextService.getWorkContext(principal.getUserId(), date));
    }

    // ============================
    // Voice Message Endpoints
    // ============================

    @PostMapping("/{diaryId}/voice-message")
    public ResponseEntity<DiaryResponse.VoiceReply> sendVoiceMessage(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String diaryId,
            @RequestParam("file") MultipartFile audioFile,
            @RequestParam(required = false) String language) {
        DiaryResponse.VoiceReply response = diaryVoiceService.processVoiceMessage(
                principal.getUserId(), diaryId, audioFile, language);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/voice-settings")
    public ResponseEntity<Map<String, Object>> getVoiceSettings(
            @AuthenticationPrincipal UserPrincipal principal) {
        DiaryVoiceSettings settings = diaryVoiceService.getVoiceSettings(principal.getUserId());
        if (settings == null) {
            return ResponseEntity.ok(Map.of(
                    "voice_type", "nova",
                    "auto_play", true,
                    "speed", 1.0
            ));
        }
        return ResponseEntity.ok(Map.of(
                "voice_type", settings.getVoiceType(),
                "auto_play", settings.getAutoPlay(),
                "speed", settings.getSpeed()
        ));
    }

    @PutMapping("/voice-settings")
    public ResponseEntity<Map<String, Object>> updateVoiceSettings(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, Object> request) {
        String voiceType = (String) request.get("voice_type");
        Boolean autoPlay = request.containsKey("auto_play") ? (Boolean) request.get("auto_play") : null;
        BigDecimal speed = request.containsKey("speed")
                ? new BigDecimal(request.get("speed").toString()) : null;

        DiaryVoiceSettings settings = diaryVoiceService.updateVoiceSettings(
                principal.getUserId(), voiceType, autoPlay, speed);

        return ResponseEntity.ok(Map.of(
                "voice_type", settings.getVoiceType(),
                "auto_play", settings.getAutoPlay(),
                "speed", settings.getSpeed()
        ));
    }
}
