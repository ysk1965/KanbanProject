package com.kanban.domain.tag.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.tag.*;
import com.kanban.domain.tag.dto.TagRequest;
import com.kanban.domain.tag.dto.TagResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TagService {

    private final TagRepository tagRepository;
    private final FeatureTagRepository featureTagRepository;
    private final TaskTagRepository taskTagRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;

    public TagResponse.ListResponse getTags(String boardId, String userId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        return getTagsInternal(boardId);
    }

    /** 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용) */
    public TagResponse.ListResponse getTagsInternal(String boardId) {
        List<Tag> tags = tagRepository.findByBoardId(boardId);
        return TagResponse.ListResponse.of(tags);
    }

    @Transactional
    public TagResponse.Detail createTag(String boardId, String userId, TagRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 중복 이름 확인
        if (tagRepository.existsByBoardIdAndName(boardId, request.getName())) {
            throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
        }

        Tag tag = Tag.builder()
                .board(board)
                .name(request.getName())
                .color(request.getColor())
                .build();

        tagRepository.save(tag);

        log.info("Tag created: {} in board: {} by user: {}", tag.getId(), boardId, userId);

        return TagResponse.Detail.of(tag);
    }

    @Transactional
    public TagResponse.Detail updateTag(String boardId, String tagId, String userId, TagRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Tag tag = tagRepository.findById(tagId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (!tag.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TAG_NOT_FOUND);
        }

        // 이름 변경 시 중복 확인
        if (request.getName() != null && !request.getName().equals(tag.getName())) {
            if (tagRepository.existsByBoardIdAndName(boardId, request.getName())) {
                throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
            }
        }

        tag.updateInfo(request.getName(), request.getColor());

        log.info("Tag updated: {} by user: {}", tagId, userId);

        return TagResponse.Detail.of(tag);
    }

    @Transactional
    public void deleteTag(String boardId, String tagId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Tag tag = tagRepository.findById(tagId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (!tag.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TAG_NOT_FOUND);
        }

        // 관련 연결 삭제
        featureTagRepository.deleteByTagId(tagId);
        taskTagRepository.deleteByTagId(tagId);

        tagRepository.delete(tag);

        log.info("Tag deleted: {} by user: {}", tagId, userId);
    }

    // Feature 태그 관리
    @Transactional
    public TagResponse.ListResponse addTagToFeature(String boardId, String featureId, String userId, TagRequest.AddTag request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        Tag tag = tagRepository.findById(request.getTagId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (!tag.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TAG_NOT_FOUND);
        }

        // 이미 추가된 태그인지 확인
        if (featureTagRepository.existsByFeatureIdAndTagId(featureId, request.getTagId())) {
            throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
        }

        FeatureTag featureTag = FeatureTag.create(feature, tag);
        featureTagRepository.save(featureTag);

        log.info("Tag {} added to feature {} by user: {}", request.getTagId(), featureId, userId);

        List<Tag> tags = featureTagRepository.findByFeatureId(featureId).stream()
                .map(FeatureTag::getTag)
                .toList();

        return TagResponse.ListResponse.of(tags);
    }

    @Transactional
    public void removeTagFromFeature(String boardId, String featureId, String tagId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        featureTagRepository.deleteByFeatureIdAndTagId(featureId, tagId);

        log.info("Tag {} removed from feature {} by user: {}", tagId, featureId, userId);
    }

    // Task 태그 관리
    @Transactional
    public TagResponse.ListResponse addTagToTask(String boardId, String taskId, String userId, TagRequest.AddTag request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Tag tag = tagRepository.findById(request.getTagId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TAG_NOT_FOUND));

        if (!tag.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TAG_NOT_FOUND);
        }

        // 이미 추가된 태그인지 확인
        if (taskTagRepository.existsByTaskIdAndTagId(taskId, request.getTagId())) {
            throw new BusinessException(ErrorCode.TAG_ALREADY_EXISTS);
        }

        TaskTag taskTag = TaskTag.create(task, tag);
        taskTagRepository.save(taskTag);

        log.info("Tag {} added to task {} by user: {}", request.getTagId(), taskId, userId);

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        return TagResponse.ListResponse.of(tags);
    }

    @Transactional
    public void removeTagFromTask(String boardId, String taskId, String tagId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        taskTagRepository.deleteByTaskIdAndTagId(taskId, tagId);

        log.info("Tag {} removed from task {} by user: {}", tagId, taskId, userId);
    }
}
