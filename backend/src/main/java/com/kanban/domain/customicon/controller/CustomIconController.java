package com.kanban.domain.customicon.controller;

import com.kanban.domain.customicon.dto.CustomIconRequest;
import com.kanban.domain.customicon.dto.CustomIconResponse;
import com.kanban.domain.customicon.service.CustomIconService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/customicon")
@RequiredArgsConstructor
public class CustomIconController {

    private final CustomIconService customIconService;

    /**
     * 레퍼런스 이미지 업로드
     */
    @PostMapping("/upload-reference")
    public ResponseEntity<CustomIconResponse.UploadResult> uploadReference(
            @RequestPart("file") MultipartFile file) {
        CustomIconResponse.UploadResult result = customIconService.uploadReference(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    /**
     * 스타일 분석 (GPT-4o Vision)
     */
    @PostMapping("/analyze-style")
    public ResponseEntity<CustomIconResponse.StyleAnalysis> analyzeStyle(
            @Valid @RequestBody CustomIconRequest.AnalyzeStyle request) {
        CustomIconResponse.StyleAnalysis result = customIconService.analyzeStyle(request);
        return ResponseEntity.ok(result);
    }

    /**
     * 아이콘 생성 (프롬프트 → 스프라이트 시트 → 크롭)
     */
    @PostMapping("/generate")
    public ResponseEntity<CustomIconResponse.GenerateResult> generate(
            @Valid @RequestBody CustomIconRequest.Generate request) {
        CustomIconResponse.GenerateResult result = customIconService.generate(request);
        return ResponseEntity.ok(result);
    }
}
