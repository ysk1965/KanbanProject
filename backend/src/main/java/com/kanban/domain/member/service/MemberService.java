package com.kanban.domain.member.service;

import com.kanban.domain.board.*;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.member.dto.MemberRequest;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
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
public class MemberService {

    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BoardService boardService;

    public MemberResponse.ListResponse getMembers(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        return MemberResponse.ListResponse.of(members);
    }

    @Transactional
    public MemberResponse.Detail inviteMember(String boardId, String userId, MemberRequest.Invite request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User inviter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 초대할 사용자 찾기
        User invitee = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 이미 멤버인지 확인
        if (boardMemberRepository.existsByBoardIdAndUserId(boardId, invitee.getId())) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_EXISTS);
        }

        // 멤버 수 제한 확인 (billable 멤버 기준)
        if (request.getRole() != Role.VIEWER) {
            Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);
            if (subscription != null) {
                int currentBillable = boardMemberRepository.countBillableMembers(boardId);
                if (currentBillable >= subscription.getMemberLimit()) {
                    throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                }
            }
        }

        // Owner 역할은 부여 불가
        if (request.getRole() == Role.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        BoardMember newMember = BoardMember.builder()
                .board(board)
                .user(invitee)
                .role(request.getRole())
                .invitedBy(inviter)
                .build();

        boardMemberRepository.save(newMember);

        log.info("Member invited: {} to board: {} with role: {} by user: {}",
                invitee.getId(), boardId, request.getRole(), userId);

        return MemberResponse.Detail.of(newMember);
    }

    @Transactional
    public MemberResponse.Detail updateMemberRole(String boardId, String memberId, String userId, MemberRequest.UpdateRole request) {
        boardService.checkAdminOrAbove(boardId, userId);

        BoardMember member = boardMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        if (!member.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND);
        }

        // Owner의 역할은 변경 불가
        if (member.isOwner()) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        // Owner 역할로 변경 불가
        if (request.getRole() == Role.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        // Viewer에서 다른 역할로 변경 시 멤버 수 제한 확인
        if (member.getRole() == Role.VIEWER && request.getRole() != Role.VIEWER) {
            Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);
            if (subscription != null) {
                int currentBillable = boardMemberRepository.countBillableMembers(boardId);
                if (currentBillable >= subscription.getMemberLimit()) {
                    throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                }
            }
        }

        member.updateRole(request.getRole());

        log.info("Member role updated: {} to {} in board: {} by user: {}",
                memberId, request.getRole(), boardId, userId);

        return MemberResponse.Detail.of(member);
    }

    @Transactional
    public void removeMember(String boardId, String memberId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        BoardMember member = boardMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        if (!member.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND);
        }

        // Owner는 내보낼 수 없음
        if (member.isOwner()) {
            throw new BusinessException(ErrorCode.CANNOT_REMOVE_OWNER);
        }

        boardMemberRepository.delete(member);

        log.info("Member removed: {} from board: {} by user: {}", memberId, boardId, userId);
    }
}
