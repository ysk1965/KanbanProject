package com.kanban.domain.personal.feature.controller;

import com.kanban.domain.personal.feature.dto.PersonalFeatureAIRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureAIResponse;
import com.kanban.domain.personal.feature.service.PersonalFeatureAIService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 마이 스페이스 기능 문서의 AI 보조. 개인 크레딧 차감 — 부족하면 402 {@code PERSONAL_AI_CREDITS_EXHAUSTED}. */
@RestController
@RequestMapping("/api/v1/personal/features/{feature_key}/ai")
@RequiredArgsConstructor
public class PersonalFeatureAIController {

    private final PersonalFeatureAIService aiService;

    /** 선택한 문장 정리 — 설교 노트 선택 서식 버블의 「정리」 */
    @PostMapping("/polish")
    public ResponseEntity<PersonalFeatureAIResponse.Polish> polish(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable("feature_key") String featureKey,
            @Valid @RequestBody PersonalFeatureAIRequest.Polish request) {
        return ResponseEntity.ok(aiService.polish(principal.getUserId(), featureKey, request.getText()));
    }
}
