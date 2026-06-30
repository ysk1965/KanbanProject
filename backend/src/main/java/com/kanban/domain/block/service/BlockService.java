package com.kanban.domain.block.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.block.dto.BlockRequest;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneBlockConfigRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;
    private final MilestoneBlockConfigRepository milestoneBlockConfigRepository;
    private final MilestoneRepository milestoneRepository;

    /** 자기 자신 프록시 — public 메서드에서 @Cacheable 내부 메서드를 호출할 때 AOP 인터셉트 보장용 */
    @Autowired
    @Lazy
    private BlockService self;

    public BlockResponse.ListResponse getBlocks(String boardId, String userId, String milestoneId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        // this.getBlocksInternal()로 직접 호출하면 @Cacheable이 동작하지 않으므로 self 프록시 경유
        return self.getBlocksInternal(boardId, milestoneId);
    }

    /**
     * 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용).
     * 캐시 이름/키는 기존 getBlocks와 동일 — 컨트롤러/Facade 경로가 같은 캐시 엔트리를 공유한다.
     */
    @Cacheable(value = "blocks", key = "#boardId + '_' + (#milestoneId != null ? #milestoneId : 'all')", unless = "#result == null")
    public BlockResponse.ListResponse getBlocksInternal(String boardId, String milestoneId) {
        if (milestoneId == null) {
            // 마일스톤 필터 없음: 보드의 모든 블록 반환
            List<Block> blocks = blockRepository.findByBoardIdOrderByPositionAsc(boardId);
            log.debug("Blocks loaded from DB for board: {}", boardId);
            return BlockResponse.ListResponse.of(blocks);
        }

        // 마일스톤 필터 있음: 고정 블록 + 보드 레벨 커스텀 블록(숨기지 않은 것) + 해당 마일스톤 전용 블록
        Set<String> hiddenBlockIds = milestoneBlockConfigRepository.findHiddenBlockIdsByMilestoneId(milestoneId);

        List<Block> boardLevelBlocks = blockRepository.findBoardLevelBlocksByBoardId(boardId);
        List<Block> milestoneSpecificBlocks = blockRepository.findByMilestoneIdOrderByPositionAsc(milestoneId);

        List<Block> filteredBlocks = new ArrayList<>();
        List<Block> hiddenBlocks = new ArrayList<>();

        // 보드 레벨 블록: 고정 블록은 항상 포함, 커스텀 블록은 숨김 여부 확인
        for (Block block : boardLevelBlocks) {
            if (block.isFixed() || !hiddenBlockIds.contains(block.getId())) {
                filteredBlocks.add(block);
            } else {
                hiddenBlocks.add(block);
            }
        }

        // 마일스톤 전용 블록 추가
        filteredBlocks.addAll(milestoneSpecificBlocks);

        // position 기준 정렬
        filteredBlocks.sort(Comparator.comparingInt(Block::getPosition));

        log.debug("Blocks loaded from DB for board: {} with milestone filter: {}", boardId, milestoneId);
        return BlockResponse.ListResponse.of(filteredBlocks, hiddenBlocks);
    }

    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
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

        Block newBlock;
        if (request.getMilestoneId() != null) {
            Milestone milestone = milestoneRepository.findById(request.getMilestoneId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));
            if (!milestone.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
            }
            newBlock = Block.createMilestoneBlock(board, milestone, request.getName(), request.getColor(), newPosition);
        } else {
            newBlock = Block.createCustomBlock(board, request.getName(), request.getColor(), newPosition);
        }
        blockRepository.save(newBlock);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(board, user, ActivityAction.BLOCK_CREATED, TargetType.BLOCK, newBlock.getId(),
                Map.of("blockName", newBlock.getName()));

        log.info("Block created: {} in board: {} by user: {}", newBlock.getId(), boardId, userId);

        BlockResponse.Detail response = BlockResponse.Detail.of(newBlock);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.BLOCK_CREATED, userId, user.getName(), response);
        return response;
    }

    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
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

        block.updateInfo(request.getName(), request.getColor(), request.getShowProgressBar());

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(block.getBoard(), user, ActivityAction.BLOCK_UPDATED, TargetType.BLOCK, blockId,
                Map.of("blockName", block.getName()));

        log.info("Block updated: {} by user: {}", blockId, userId);

        BlockResponse.Detail response = BlockResponse.Detail.of(block);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.BLOCK_UPDATED, userId, user.getName(), response);
        return response;
    }

    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
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

        // 활동 로그 기록 (삭제 전에 기록)
        String blockName = block.getName();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(block.getBoard(), user, ActivityAction.BLOCK_DELETED, TargetType.BLOCK, blockId,
                Map.of("blockName", blockName));

        // 블록 내 Task들을 Task 고정 블록으로 이동
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));
        taskRepository.moveTasksToBlock(blockId, taskBlock);

        // 마일스톤 블록 숨김 설정 정리
        milestoneBlockConfigRepository.deleteByBlockId(blockId);

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

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.BLOCK_DELETED, userId, user.getName(), Map.of("id", blockId));
    }

    @Transactional
    @CacheEvict(value = "blocks", allEntries = true)
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
        BlockResponse.ListResponse response = BlockResponse.ListResponse.of(reorderedBlocks);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.BLOCKS_REORDERED, userId, user.getName(), response);
        return response;
    }
}
