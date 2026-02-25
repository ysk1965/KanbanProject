package com.kanban.domain.customicon.controller;

import com.kanban.domain.customicon.dto.CustomIconRequest;
import com.kanban.domain.customicon.dto.CustomIconResponse;
import com.kanban.domain.customicon.service.CustomIconService;
import com.kanban.domain.customicon.service.CustomIconImageService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/customicon")
@RequiredArgsConstructor
public class CustomIconController {

    private final CustomIconService customIconService;
    private final CustomIconImageService customIconImageService;

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

    /**
     * 생성된 아이콘 파일 서빙 (CloudFront 미설정 시 S3 프록시)
     */
    @GetMapping("/files/**")
    public ResponseEntity<byte[]> serveFile(HttpServletRequest request) {
        String fullPath = request.getRequestURI();
        String key = fullPath.substring(fullPath.indexOf("/files/") + "/files/".length());

        byte[] data = customIconImageService.loadFile(key);

        MediaType mediaType = key.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.APPLICATION_OCTET_STREAM;

        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(24)).cachePublic())
                .body(data);
    }
}
