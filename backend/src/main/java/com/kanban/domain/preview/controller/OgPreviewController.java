package com.kanban.domain.preview.controller;

import com.kanban.domain.preview.dto.OgPreviewResponse;
import com.kanban.domain.preview.service.OgPreviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공개 공유 링크 미리보기 메타 엔드포인트 (permitAll via /api/v1/public/**).
 * Lambda@Edge가 봇 요청 경로에서 {type}/{token}을 뽑아 호출하고, 응답으로 og:* 태그를 조립해 주입한다.
 * 예: GET /api/v1/public/og-preview/note/{token}
 */
@RestController
@RequestMapping("/api/v1/public/og-preview")
@RequiredArgsConstructor
public class OgPreviewController {

    private final OgPreviewService ogPreviewService;

    @GetMapping("/{type}/{token}")
    public ResponseEntity<OgPreviewResponse> preview(
            @PathVariable String type,
            @PathVariable String token) {
        return ResponseEntity.ok(ogPreviewService.resolve(type, token));
    }
}
