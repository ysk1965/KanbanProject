package com.kanban.domain.tag.controller;

import com.kanban.domain.tag.dto.TagRequest;
import com.kanban.domain.tag.dto.TagResponse;
import com.kanban.domain.tag.service.TagService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    // 태그 CRUD
    @GetMapping("/tags")
    public ResponseEntity<TagResponse.ListResponse> getTags(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        TagResponse.ListResponse response = tagService.getTags(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/tags")
    public ResponseEntity<TagResponse.Detail> createTag(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TagRequest.Create request) {
        TagResponse.Detail response = tagService.createTag(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/tags/{tagId}")
    public ResponseEntity<TagResponse.Detail> updateTag(
            @PathVariable String boardId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TagRequest.Update request) {
        TagResponse.Detail response = tagService.updateTag(boardId, tagId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/tags/{tagId}")
    public ResponseEntity<Map<String, String>> deleteTag(
            @PathVariable String boardId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        tagService.deleteTag(boardId, tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 삭제되었습니다"));
    }

    // Feature 태그 관리
    @PostMapping("/features/{featureId}/tags")
    public ResponseEntity<TagResponse.ListResponse> addTagToFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TagRequest.AddTag request) {
        TagResponse.ListResponse response = tagService.addTagToFeature(boardId, featureId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/features/{featureId}/tags/{tagId}")
    public ResponseEntity<Map<String, String>> removeTagFromFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        tagService.removeTagFromFeature(boardId, featureId, tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 제거되었습니다"));
    }

    // Task 태그 관리
    @PostMapping("/tasks/{taskId}/tags")
    public ResponseEntity<TagResponse.ListResponse> addTagToTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TagRequest.AddTag request) {
        TagResponse.ListResponse response = tagService.addTagToTask(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/tasks/{taskId}/tags/{tagId}")
    public ResponseEntity<Map<String, String>> removeTagFromTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String tagId,
            @AuthenticationPrincipal UserPrincipal principal) {
        tagService.removeTagFromTask(boardId, taskId, tagId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "태그가 제거되었습니다"));
    }
}
