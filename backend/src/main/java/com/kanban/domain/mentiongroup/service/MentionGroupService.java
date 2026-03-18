package com.kanban.domain.mentiongroup.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.mentiongroup.MentionGroup;
import com.kanban.domain.mentiongroup.MentionGroupMember;
import com.kanban.domain.mentiongroup.MentionGroupRepository;
import com.kanban.domain.mentiongroup.dto.MentionGroupRequest;
import com.kanban.domain.mentiongroup.dto.MentionGroupResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
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
public class MentionGroupService {

    private final MentionGroupRepository mentionGroupRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public MentionGroupResponse.ListResponse getGroups(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<MentionGroup> groups = mentionGroupRepository.findByBoardIdOrderByCreatedAtAsc(boardId);
        return MentionGroupResponse.ListResponse.of(groups);
    }

    @Transactional
    public MentionGroupResponse.Detail createGroup(String boardId, String userId, MentionGroupRequest.Create request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (mentionGroupRepository.existsByBoardIdAndName(boardId, request.getName())) {
            throw new BusinessException(ErrorCode.MENTION_GROUP_ALREADY_EXISTS);
        }

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        MentionGroup group = MentionGroup.builder()
                .board(board)
                .name(request.getName())
                .createdBy(creator)
                .build();

        // Add members
        for (String memberId : request.getMemberIds()) {
            User memberUser = userRepository.findById(memberId).orElse(null);
            if (memberUser != null) {
                group.addMember(MentionGroupMember.create(group, memberUser));
            }
        }

        mentionGroupRepository.save(group);

        log.info("Mention group created: {} in board: {} by user: {}", group.getId(), boardId, userId);

        return MentionGroupResponse.Detail.of(group);
    }

    @Transactional
    public MentionGroupResponse.Detail updateGroup(String boardId, String groupId, String userId, MentionGroupRequest.Update request) {
        boardService.checkAdminOrAbove(boardId, userId);

        MentionGroup group = mentionGroupRepository.findByIdAndBoardId(groupId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MENTION_GROUP_NOT_FOUND));

        // Check name uniqueness if name changed
        if (!group.getName().equals(request.getName())) {
            if (mentionGroupRepository.existsByBoardIdAndName(boardId, request.getName())) {
                throw new BusinessException(ErrorCode.MENTION_GROUP_ALREADY_EXISTS);
            }
            group.updateName(request.getName());
        }

        // Replace members
        group.clearMembers();
        for (String memberId : request.getMemberIds()) {
            User memberUser = userRepository.findById(memberId).orElse(null);
            if (memberUser != null) {
                group.addMember(MentionGroupMember.create(group, memberUser));
            }
        }

        log.info("Mention group updated: {} by user: {}", groupId, userId);

        return MentionGroupResponse.Detail.of(group);
    }

    @Transactional
    public void deleteGroup(String boardId, String groupId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        MentionGroup group = mentionGroupRepository.findByIdAndBoardId(groupId, boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MENTION_GROUP_NOT_FOUND));

        mentionGroupRepository.delete(group);

        log.info("Mention group deleted: {} by user: {}", groupId, userId);
    }
}
