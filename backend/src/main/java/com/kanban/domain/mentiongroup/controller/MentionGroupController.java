package com.kanban.domain.mentiongroup.controller;

import com.kanban.domain.mentiongroup.dto.MentionGroupRequest;
import com.kanban.domain.mentiongroup.dto.MentionGroupResponse;
import com.kanban.domain.mentiongroup.service.MentionGroupService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/mention-groups")
@RequiredArgsConstructor
public class MentionGroupController {

    private final MentionGroupService mentionGroupService;

    @GetMapping
    public ResponseEntity<MentionGroupResponse.ListResponse> getGroups(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        MentionGroupResponse.ListResponse response = mentionGroupService.getGroups(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<MentionGroupResponse.Detail> createGroup(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MentionGroupRequest.Create request) {
        MentionGroupResponse.Detail response = mentionGroupService.createGroup(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{groupId}")
    public ResponseEntity<MentionGroupResponse.Detail> updateGroup(
            @PathVariable String boardId,
            @PathVariable String groupId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MentionGroupRequest.Update request) {
        MentionGroupResponse.Detail response = mentionGroupService.updateGroup(boardId, groupId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Map<String, String>> deleteGroup(
            @PathVariable String boardId,
            @PathVariable String groupId,
            @AuthenticationPrincipal UserPrincipal principal) {
        mentionGroupService.deleteGroup(boardId, groupId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "멘션 그룹이 삭제되었습니다"));
    }
}
