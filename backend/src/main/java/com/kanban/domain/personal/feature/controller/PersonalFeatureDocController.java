package com.kanban.domain.personal.feature.controller;

import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocResponse;
import com.kanban.domain.personal.feature.dto.PersonalFeatureTermResponse;
import com.kanban.domain.personal.feature.service.PersonalFeatureDocService;
import com.kanban.domain.personal.feature.service.PersonalFeatureTermService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 마이 스페이스 「기능」 탭 — 기능별 문서와 추천 용어.
 *
 * <p>모든 응답 JSON은 Jackson SNAKE_CASE 전략을 따른다 (feature_key, schema_ver, updated_at …).
 */
@RestController
@RequestMapping("/api/v1/personal/features/{feature_key}")
@RequiredArgsConstructor
public class PersonalFeatureDocController {

    private final PersonalFeatureDocService docService;
    private final PersonalFeatureTermService termService;

    @GetMapping("/docs")
    public ResponseEntity<List<PersonalFeatureDocResponse.Summary>> listDocs(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey) {
        return ResponseEntity.ok(docService.list(principal.getUserId(), featureKey));
    }

    @PostMapping("/docs")
    public ResponseEntity<PersonalFeatureDocResponse.Detail> createDoc(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @Valid @RequestBody PersonalFeatureDocRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(docService.create(principal.getUserId(), featureKey, request));
    }

    @GetMapping("/docs/{docId}")
    public ResponseEntity<PersonalFeatureDocResponse.Detail> getDoc(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @PathVariable String docId) {
        return ResponseEntity.ok(docService.get(principal.getUserId(), featureKey, docId));
    }

    @PatchMapping("/docs/{docId}")
    public ResponseEntity<PersonalFeatureDocResponse.Detail> patchDoc(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @PathVariable String docId,
            @Valid @RequestBody PersonalFeatureDocRequest.Patch request) {
        return ResponseEntity.ok(docService.patch(principal.getUserId(), featureKey, docId, request));
    }

    @PostMapping("/docs/{docId}/duplicate")
    public ResponseEntity<PersonalFeatureDocResponse.Detail> duplicateDoc(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @PathVariable String docId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(docService.duplicate(principal.getUserId(), featureKey, docId));
    }

    @DeleteMapping("/docs/{docId}")
    public ResponseEntity<Void> deleteDoc(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @PathVariable String docId) {
        docService.delete(principal.getUserId(), featureKey, docId);
        return ResponseEntity.noContent().build();
    }

    /** 문서를 열 때 한 번 호출. field 생략 시 열마다 최대 300개씩 전체. */
    @GetMapping("/terms")
    public ResponseEntity<List<PersonalFeatureTermResponse>> listTerms(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @RequestParam(name = "field", required = false) String field) {
        return ResponseEntity.ok(termService.list(principal.getUserId(), featureKey, field));
    }

    /** 추천 항목의 ✕ */
    @DeleteMapping("/terms")
    public ResponseEntity<Void> forgetTerm(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @RequestParam(name = "field") String field,
            @RequestParam(name = "value") String value) {
        termService.forget(principal.getUserId(), featureKey, field, value);
        return ResponseEntity.noContent().build();
    }
}
