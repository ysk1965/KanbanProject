package com.kanban.domain.feature.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class InboxFeatureService {

    public static final String INBOX_TITLE = "미분류";
    private static final String INBOX_COLOR = "#64748b";
    private static final int INBOX_POSITION = 999999;

    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final BlockRepository blockRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;

    /**
     * 보드의 "미분류"(inbox) Feature를 조회하거나 없으면 생성한다.
     * Feature 미지정 Task 생성 시 자동 귀속 대상으로 사용된다.
     * Board pessimistic lock + 락 후 재확인으로 동시 생성을 방지한다.
     */
    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public Feature getOrCreateInboxFeature(String boardId, String userId) {
        Optional<Feature> existingInbox = featureRepository.findByBoardIdAndIsInboxTrue(boardId);
        if (existingInbox.isPresent()) {
            return existingInbox.get();
        }

        Board board = boardRepository.findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 락 획득 후 재확인 (동시성)
        Optional<Feature> doubleCheck = featureRepository.findByBoardIdAndIsInboxTrue(boardId);
        if (doubleCheck.isPresent()) {
            return doubleCheck.get();
        }

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Feature inboxFeature = Feature.builder()
                .board(board)
                .title(INBOX_TITLE)
                .color(INBOX_COLOR)
                .position(INBOX_POSITION)
                .isInbox(true)
                .createdBy(creator)
                .build();
        featureRepository.save(inboxFeature);
        log.info("Inbox feature created for board: {}", boardId);
        return inboxFeature;
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public Task getOrCreateInboxTask(String boardId, String userId) {
        Feature inboxFeature = getOrCreateInboxFeature(boardId, userId);

        var inboxTasks = taskRepository.findByFeatureIdOrderByPositionAsc(inboxFeature.getId());
        if (!inboxTasks.isEmpty()) {
            return inboxTasks.get(0);
        }

        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Task inboxTask = Task.builder()
                .feature(inboxFeature)
                .board(inboxFeature.getBoard())
                .block(taskBlock)
                .title(INBOX_TITLE)
                .position(0)
                .createdBy(creator)
                .build();
        taskRepository.save(inboxTask);

        inboxFeature.incrementTotalTasks();

        log.info("Inbox task created for board: {}", boardId);
        return inboxTask;
    }
}
