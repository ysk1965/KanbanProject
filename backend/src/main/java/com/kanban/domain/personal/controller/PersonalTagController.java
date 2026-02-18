package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalTagRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.personal.service.PersonalTaskService;
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
@RequestMapping("/api/v1/personal/tags")
@RequiredArgsConstructor
public class PersonalTagController {

    private final PersonalTaskService personalTaskService;

    @GetMapping
    public ResponseEntity<List<PersonalTaskResponse.TagInfo>> getTags(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalTaskService.getTags(principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<PersonalTaskResponse.TagInfo> createTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PersonalTagRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(personalTaskService.createTag(principal.getUserId(), request));
    }

    @PutMapping("/{tagId}")
    public ResponseEntity<PersonalTaskResponse.TagInfo> updateTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String tagId,
            @Valid @RequestBody PersonalTagRequest.Update request) {
        return ResponseEntity.ok(personalTaskService.updateTag(principal.getUserId(), tagId, request));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Map<String, String>> deleteTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String tagId) {
        personalTaskService.deleteTag(principal.getUserId(), tagId);
        return ResponseEntity.ok(Map.of("message", "태그가 삭제되었습니다"));
    }
}
