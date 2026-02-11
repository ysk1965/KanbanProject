package com.kanban.domain.board.controller;

import com.kanban.domain.board.dto.BoardCustomEmojiResponse;
import com.kanban.domain.board.service.BoardCustomEmojiService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/custom-emojis")
@RequiredArgsConstructor
public class BoardCustomEmojiController {

    private final BoardCustomEmojiService customEmojiService;

    @GetMapping
    public ResponseEntity<BoardCustomEmojiResponse.ListResponse> getEmojis(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardCustomEmojiResponse.ListResponse response =
                customEmojiService.getEmojis(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<BoardCustomEmojiResponse.Detail> uploadEmoji(
            @PathVariable String boardId,
            @RequestParam("name") String name,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardCustomEmojiResponse.Detail response =
                customEmojiService.uploadEmoji(boardId, principal.getUserId(), name, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{emojiId}")
    public ResponseEntity<Map<String, String>> deleteEmoji(
            @PathVariable String boardId,
            @PathVariable String emojiId,
            @AuthenticationPrincipal UserPrincipal principal) {
        customEmojiService.deleteEmoji(boardId, emojiId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "커스텀 이모지가 삭제되었습니다"));
    }
}
