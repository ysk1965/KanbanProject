package com.kanban.domain.invite.service;

import com.kanban.domain.board.*;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.invite.InviteLink;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.invite.dto.InviteRequest;
import com.kanban.domain.invite.dto.InviteResponse;
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

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InviteService {

    private final InviteLinkRepository inviteLinkRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BoardService boardService;

    public InviteResponse.ListResponse getInviteLinks(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<InviteLink> links = inviteLinkRepository.findByBoardIdAndIsActiveTrue(boardId);
        return InviteResponse.ListResponse.of(links);
    }

    @Transactional
    public InviteResponse.Detail createInviteLink(String boardId, String userId, InviteRequest.Create request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Role role = request.getRole() != null ? request.getRole() : Role.MEMBER;

        // Owner 역할로 초대 링크 생성 불가
        if (role == Role.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        LocalDateTime expiresAt = null;
        if (request.getExpiresInHours() != null && request.getExpiresInHours() > 0) {
            expiresAt = LocalDateTime.now().plusHours(request.getExpiresInHours());
        }

        InviteLink link = InviteLink.builder()
                .board(board)
                .role(role)
                .maxUses(request.getMaxUses())
                .expiresAt(expiresAt)
                .createdBy(creator)
                .build();

        inviteLinkRepository.save(link);

        log.info("Invite link created: {} for board: {} by user: {}", link.getCode(), boardId, userId);

        return InviteResponse.Detail.of(link);
    }

    @Transactional
    public void deleteInviteLink(String boardId, String inviteId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        InviteLink link = inviteLinkRepository.findById(inviteId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_LINK_NOT_FOUND));

        if (!link.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.INVITE_LINK_NOT_FOUND);
        }

        link.deactivate();

        log.info("Invite link deactivated: {} by user: {}", inviteId, userId);
    }

    public InviteResponse.Info getInviteLinkInfo(String code) {
        InviteLink link = inviteLinkRepository.findByCode(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_LINK_NOT_FOUND));

        return InviteResponse.Info.of(link);
    }

    @Transactional
    public InviteResponse.AcceptResult acceptInvite(String code, String userId) {
        InviteLink link = inviteLinkRepository.findByCodeAndIsActiveTrue(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_LINK_NOT_FOUND));

        if (!link.isValid()) {
            if (link.getExpiresAt() != null && LocalDateTime.now().isAfter(link.getExpiresAt())) {
                throw new BusinessException(ErrorCode.INVITE_LINK_EXPIRED);
            }
            throw new BusinessException(ErrorCode.INVITE_LINK_INVALID);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Board board = link.getBoard();

        // 이미 멤버인지 확인
        if (boardMemberRepository.existsByBoardIdAndUserId(board.getId(), userId)) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_EXISTS);
        }

        // 멤버 수 제한 확인
        if (link.getRole() != Role.VIEWER) {
            Subscription subscription = subscriptionRepository.findByBoardId(board.getId()).orElse(null);
            if (subscription != null) {
                int currentBillable = boardMemberRepository.countBillableMembers(board.getId());
                if (currentBillable >= subscription.getMemberLimit()) {
                    throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                }
            }
        }

        // 멤버 추가
        BoardMember newMember = BoardMember.builder()
                .board(board)
                .user(user)
                .role(link.getRole())
                .invitedBy(link.getCreatedBy())
                .build();

        boardMemberRepository.save(newMember);

        // 사용 횟수 증가
        link.incrementUsedCount();

        log.info("User {} joined board {} via invite link {}", userId, board.getId(), code);

        return InviteResponse.AcceptResult.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .role(link.getRole())
                .message("보드에 성공적으로 참가했습니다")
                .build();
    }
}
