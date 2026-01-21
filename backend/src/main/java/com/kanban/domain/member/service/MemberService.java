package com.kanban.domain.member.service;

import com.kanban.domain.board.*;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.invite.InviteLink;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.member.dto.MemberRequest;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.email.EmailService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final BoardService boardService;
    private final EmailService emailService;

    @Cacheable(value = "members", key = "#boardId", unless = "#result == null")
    public MemberResponse.ListResponse getMembers(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        log.debug("Members loaded from DB for board: {}", boardId);
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        return MemberResponse.ListResponse.of(members);
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.InviteResult inviteMember(String boardId, String userId, MemberRequest.Invite request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User inviter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Owner 역할은 부여 불가
        if (request.getRole() == Role.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        // 초대할 사용자 찾기
        Optional<User> inviteeOpt = userRepository.findByEmail(request.getEmail());

        if (inviteeOpt.isPresent()) {
            // 기존 사용자 - 바로 멤버로 추가
            User invitee = inviteeOpt.get();
            return addExistingUserAsMember(board, inviter, invitee, request.getRole(), boardId);
        } else {
            // 미가입 사용자 - 이메일 초대 발송
            return sendEmailInvitation(board, inviter, request.getEmail(), request.getRole());
        }
    }

    private MemberResponse.InviteResult addExistingUserAsMember(Board board, User inviter, User invitee, Role role, String boardId) {
        // Pessimistic Lock으로 Board 조회 - 멤버 제한 동시성 제어
        boardRepository.findByIdWithLock(boardId);

        // 이미 멤버인지 확인
        if (boardMemberRepository.existsByBoardIdAndUserId(boardId, invitee.getId())) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_EXISTS);
        }

        // 멤버 수 제한 확인 (billable 멤버 기준) - Lock 획득 후 체크하여 동시성 안전
        if (role != Role.VIEWER) {
            Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);
            if (subscription != null) {
                int currentBillable = boardMemberRepository.countBillableMembers(boardId);
                if (currentBillable >= subscription.getMemberLimit()) {
                    throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                }
            }
        }

        BoardMember newMember = BoardMember.builder()
                .board(board)
                .user(invitee)
                .role(role)
                .invitedBy(inviter)
                .build();

        boardMemberRepository.save(newMember);

        log.info("Member added directly: {} to board: {} with role: {} by user: {}",
                invitee.getId(), boardId, role, inviter.getId());

        return MemberResponse.InviteResult.ofDirectAdd(newMember);
    }

    private MemberResponse.InviteResult sendEmailInvitation(Board board, User inviter, String email, Role role) {
        // 초대 링크 생성 (7일 후 만료, 1회 사용)
        InviteLink inviteLink = InviteLink.builder()
                .board(board)
                .role(role)
                .maxUses(1)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .createdBy(inviter)
                .build();

        inviteLinkRepository.save(inviteLink);

        // 이메일 발송 (비동기)
        emailService.sendInviteEmail(
                email,
                board.getName(),
                inviter.getName(),
                inviteLink.getCode(),
                role.name()
        );

        log.info("Invite email sent to: {} for board: {} with role: {} by user: {}",
                email, board.getId(), role, inviter.getId());

        return MemberResponse.InviteResult.ofEmailSent(email, role.name());
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.Detail updateMemberRole(String boardId, String memberId, String userId, MemberRequest.UpdateRole request) {
        boardService.checkAdminOrAbove(boardId, userId);

        // Pessimistic Lock으로 Board 조회 - 멤버 제한 동시성 제어
        boardRepository.findByIdWithLock(boardId);

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

        // Viewer에서 다른 역할로 변경 시 멤버 수 제한 확인 - Lock 획득 후 체크
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
    @CacheEvict(value = "members", key = "#boardId")
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
