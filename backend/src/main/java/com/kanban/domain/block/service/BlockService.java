package com.kanban.domain.block.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.block.dto.BlockRequest;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BlockService {

    private final BlockRepository blockRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;

    @Cacheable(value = "blocks", key = "#boardId", unless = "#result == null")
    public BlockResponse.ListResponse getBlocks(String boardId, String userId) {
        // 뷰어 이상 권한 확인
        boardService.checkViewerOrAbove(boardId, userId);

        List<Block> blocks = blockRepository.findByBoardIdOrderByPositionAsc(boardId);
        log.debug("Blocks loaded from DB for board: {}", boardId);
        return BlockResponse.ListResponse.of(blocks);
    }

    @Transactional
    @CacheEvict(value = "blocks", key = "#boardId")
    public BlockResponse.Detail createBlock(String boardId, String userId, BlockRequest.Create request) {
        // Admin 이상 권한 확인
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // Done 블록 찾기 (커스텀 블록은 Done 블록 앞에 생성)
        Block doneBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.DONE)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // Done 블록 전 위치에 새 블록 생성
        int newPosition = doneBlock.getPosition();

        // Done 블록과 그 뒤의 블록들 position 증가
        List<Block> blocksToShift = blockRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .filter(b -> b.getPosition() >= newPosition)
                .toList();

        for (Block block : blocksToShift) {
            block.updatePosition(block.getPosition() + 1);
        }

        Block newBlock = Block.createCustomBlock(board, request.getName(), request.getColor(), newPosition);
        blockRepository.save(newBlock);

        log.info("Block created: {} in board: {} by user: {}", newBlock.getId(), boardId, userId);

        return BlockResponse.Detail.of(newBlock);
    }

    @Transactional
    @CacheEvict(value = "blocks", key = "#boardId")
    public BlockResponse.Detail updateBlock(String boardId, String blockId, String userId, BlockRequest.Update request) {
        // Admin 이상 권한 확인
        boardService.checkAdminOrAbove(boardId, userId);

        Block block = blockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // 보드 소속 확인
        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
        }

        // 고정 블록 수정 불가
        if (block.isFixed()) {
            throw new BusinessException(ErrorCode.BLOCK_CANNOT_MODIFY_FIXED);
        }

        block.updateInfo(request.getName(), request.getColor());

        log.info("Block updated: {} by user: {}", blockId, userId);

        return BlockResponse.Detail.of(block);
    }

    @Transactional
    @CacheEvict(value = "blocks", key = "#boardId")
    public void deleteBlock(String boardId, String blockId, String userId) {
        // Admin 이상 권한 확인
        boardService.checkAdminOrAbove(boardId, userId);

        Block block = blockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // 보드 소속 확인
        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
        }

        // 고정 블록 삭제 불가
        if (block.isFixed()) {
            throw new BusinessException(ErrorCode.BLOCK_CANNOT_DELETE_FIXED);
        }

        int deletedPosition = block.getPosition();
        blockRepository.delete(block);

        // 삭제된 블록 뒤의 블록들 position 감소
        List<Block> blocksToShift = blockRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .filter(b -> b.getPosition() > deletedPosition)
                .toList();

        for (Block b : blocksToShift) {
            b.updatePosition(b.getPosition() - 1);
        }

        log.info("Block deleted: {} by user: {}", blockId, userId);
    }

    @Transactional
    @CacheEvict(value = "blocks", key = "#boardId")
    public BlockResponse.ListResponse reorderBlocks(String boardId, String userId, BlockRequest.Reorder request) {
        // Admin 이상 권한 확인
        boardService.checkAdminOrAbove(boardId, userId);

        List<Block> allBlocks = blockRepository.findByBoardIdOrderByPositionAsc(boardId);
        Map<String, Block> blockMap = allBlocks.stream()
                .collect(Collectors.toMap(Block::getId, Function.identity()));

        // 요청된 블록 ID들이 모두 해당 보드의 블록인지 확인
        for (String blockId : request.getBlockIds()) {
            if (!blockMap.containsKey(blockId)) {
                throw new BusinessException(ErrorCode.BLOCK_NOT_FOUND);
            }
        }

        // 요청된 모든 블록이 포함되어 있는지 확인
        if (request.getBlockIds().size() != allBlocks.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 고정 블록 위치 규칙 검증
        // Feature(0) > Task(1) > Custom blocks > Done(마지막)
        List<String> blockIds = request.getBlockIds();

        Block featureBlock = blockMap.values().stream()
                .filter(Block::isFeatureBlock)
                .findFirst()
                .orElse(null);

        Block taskBlock = blockMap.values().stream()
                .filter(Block::isTaskBlock)
                .findFirst()
                .orElse(null);

        Block doneBlock = blockMap.values().stream()
                .filter(Block::isDoneBlock)
                .findFirst()
                .orElse(null);

        // Feature는 항상 첫 번째
        if (featureBlock != null && !blockIds.get(0).equals(featureBlock.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // Task는 항상 두 번째
        if (taskBlock != null && !blockIds.get(1).equals(taskBlock.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // Done은 항상 마지막
        if (doneBlock != null && !blockIds.get(blockIds.size() - 1).equals(doneBlock.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 순서 업데이트
        for (int i = 0; i < blockIds.size(); i++) {
            Block block = blockMap.get(blockIds.get(i));
            block.updatePosition(i);
        }

        log.info("Blocks reordered in board: {} by user: {}", boardId, userId);

        List<Block> reorderedBlocks = blockRepository.findByBoardIdOrderByPositionAsc(boardId);
        return BlockResponse.ListResponse.of(reorderedBlocks);
    }
}
