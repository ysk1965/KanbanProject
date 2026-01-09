package com.kanban.domain.block.controller;

import com.kanban.domain.block.dto.BlockRequest;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.block.service.BlockService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/blocks")
@RequiredArgsConstructor
public class BlockController {

    private final BlockService blockService;

    @GetMapping
    public ResponseEntity<BlockResponse.ListResponse> getBlocks(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BlockResponse.ListResponse response = blockService.getBlocks(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<BlockResponse.Detail> createBlock(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BlockRequest.Create request) {
        BlockResponse.Detail response = blockService.createBlock(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{blockId}")
    public ResponseEntity<BlockResponse.Detail> updateBlock(
            @PathVariable String boardId,
            @PathVariable String blockId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BlockRequest.Update request) {
        BlockResponse.Detail response = blockService.updateBlock(boardId, blockId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{blockId}")
    public ResponseEntity<Map<String, String>> deleteBlock(
            @PathVariable String boardId,
            @PathVariable String blockId,
            @AuthenticationPrincipal UserPrincipal principal) {
        blockService.deleteBlock(boardId, blockId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "블록이 삭제되었습니다"));
    }

    @PutMapping("/reorder")
    public ResponseEntity<BlockResponse.ListResponse> reorderBlocks(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BlockRequest.Reorder request) {
        BlockResponse.ListResponse response = blockService.reorderBlocks(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
