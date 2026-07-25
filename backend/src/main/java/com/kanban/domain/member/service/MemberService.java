package com.kanban.domain.member.service;

import com.kanban.domain.board.*;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.jobrole.entity.JobRole;
import com.kanban.domain.jobrole.repository.JobRoleRepository;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.invite.InviteLink;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.member.dto.MemberRequest;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.email.EmailService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.exception.OrgSeatLimitException;
import com.kanban.global.exception.SeatLimitException;
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

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final BoardService boardService;
    private final EmailService emailService;
    private final WebSocketEventService webSocketEventService;
    private final OrgMemberRepository orgMemberRepository;
    private final JobRoleRepository jobRoleRepository;

    /** 자기 자신 프록시 — public 메서드에서 @Cacheable 내부 메서드를 호출할 때 AOP 인터셉트 보장용 */
    @Autowired
    @Lazy
    private MemberService self;

    public MemberResponse.ListResponse getMembers(String boardId, String userId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        // this.getMembersInternal()로 직접 호출하면 @Cacheable이 동작하지 않으므로 self 프록시 경유
        return self.getMembersInternal(boardId);
    }

    /**
     * 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용).
     * 캐시 이름/키는 기존 getMembers와 동일 — 컨트롤러/Facade 경로가 같은 캐시 엔트리를 공유한다.
     */
    @Cacheable(value = "members", key = "#boardId", unless = "#result == null")
    public MemberResponse.ListResponse getMembersInternal(String boardId) {
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
        if (request.getRole() == BoardRole.OWNER) {
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

    private MemberResponse.InviteResult addExistingUserAsMember(Board board, User inviter, User invitee, BoardRole role, String boardId) {
        // Pessimistic Lock으로 Board 조회 - 멤버 제한 동시성 제어
        boardRepository.findByIdWithLock(boardId);

        // R2: 조직 보드인 경우 조직원 여부 검증
        if (board.isOrganizationBoard()) {
            String orgId = board.getOrganization().getId();
            if (!orgMemberRepository.existsByOrganizationIdAndUserId(orgId, invitee.getId())) {
                throw new BusinessException(ErrorCode.NOT_ORG_MEMBER_FOR_BOARD);
            }
        }

        // 이미 멤버인지 확인
        if (boardMemberRepository.existsByBoardIdAndUserId(boardId, invitee.getId())) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_EXISTS);
        }

        // 멤버 수 제한 확인 (billable 멤버 기준) - Lock 획득 후 체크하여 동시성 안전
        if (role != BoardRole.VIEWER) {
            if (board.isOrgManaged()) {
                checkOrgSeatLimit(board, inviter.getId());
            } else {
                Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);
                if (subscription != null) {
                    int currentBillable = boardMemberRepository.countBillableMembers(boardId);
                    if (currentBillable >= subscription.getMemberLimit()) {
                        if (subscription.isActive()) {
                            throw new SeatLimitException(
                                    subscription.getSeatCount(), currentBillable,
                                    Subscription.MONTHLY_PRICE_PER_SEAT, Subscription.YEARLY_PRICE_PER_SEAT);
                        }
                        throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                    }
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

    private MemberResponse.InviteResult sendEmailInvitation(Board board, User inviter, String email, BoardRole role) {
        // 초대 링크 생성 (7일 후 만료, 1회 사용)
        InviteLink inviteLink = InviteLink.builder()
                .board(board)
                .role(role)
                .maxUses(1)
                .expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(7))
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
        if (request.getRole() == BoardRole.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_OWNER_ROLE);
        }

        // Viewer에서 다른 역할로 변경 시 멤버 수 제한 확인 - Lock 획득 후 체크
        if (member.getRole() == BoardRole.VIEWER && request.getRole() != BoardRole.VIEWER) {
            Board board = member.getBoard();
            if (board.isOrgManaged()) {
                checkOrgSeatLimit(board, userId);
            } else {
                Subscription subscription = subscriptionRepository.findByBoardId(boardId).orElse(null);
                if (subscription != null) {
                    int currentBillable = boardMemberRepository.countBillableMembers(boardId);
                    if (currentBillable >= subscription.getMemberLimit()) {
                        if (subscription.isActive()) {
                            throw new SeatLimitException(
                                    subscription.getSeatCount(), currentBillable,
                                    Subscription.MONTHLY_PRICE_PER_SEAT, Subscription.YEARLY_PRICE_PER_SEAT);
                        }
                        throw new BusinessException(ErrorCode.MEMBER_LIMIT_EXCEEDED);
                    }
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
    public MemberResponse.Detail updateMemberColor(String boardId, String memberId, String userId, MemberRequest.UpdateColor request) {
        boardService.checkViewerOrAbove(boardId, userId);

        BoardMember member = boardMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        if (!member.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND);
        }

        // 본인 또는 Admin 이상만 색상 변경 가능
        boolean isSelf = member.getUser().getId().equals(userId);
        if (!isSelf) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        member.updateAssigneeColor(request.getAssigneeColor());

        log.info("Member color updated: {} to {} in board: {} by user: {}",
                memberId, request.getAssigneeColor(), boardId, userId);

        MemberResponse.Detail response = MemberResponse.Detail.of(member);
        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEMBER_UPDATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.Detail updateMemberGithubLogin(String boardId, String memberId, String userId, MemberRequest.UpdateGithubLogin request) {
        boardService.checkViewerOrAbove(boardId, userId);

        BoardMember member = boardMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        if (!member.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND);
        }

        // 본인 또는 Admin 이상만 GitHub 계정 연결 가능
        boolean isSelf = member.getUser().getId().equals(userId);
        if (!isSelf) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        String login = request.getGithubLogin();
        if (login != null) {
            login = login.trim();
            if (login.isEmpty()) login = null;
        }
        member.updateGithubLogin(login);

        log.info("Member githubLogin updated: {} to {} in board: {} by user: {}",
                memberId, login, boardId, userId);

        MemberResponse.Detail response = MemberResponse.Detail.of(member);
        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEMBER_UPDATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.Detail updateMemberJobRole(String boardId, String memberId, String userId, MemberRequest.UpdateJobRole request) {
        boardService.checkAdminOrAbove(boardId, userId);

        BoardMember member = boardMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        if (!member.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND);
        }

        JobRole jobRole = null;
        if (request.getJobRoleId() != null && !request.getJobRoleId().isBlank()) {
            jobRole = jobRoleRepository.findByIdAndBoardId(request.getJobRoleId(), boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.JOB_ROLE_NOT_FOUND));
        }

        member.updateJobRole(jobRole);

        log.info("Member jobRole updated: {} to {} in board: {} by user: {}",
                memberId, jobRole != null ? jobRole.getId() : "null", boardId, userId);

        MemberResponse.Detail response = MemberResponse.Detail.of(member);
        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEMBER_UPDATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.ListResponse reorderMembers(String boardId, String userId, MemberRequest.ReorderMembers request) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        Map<String, BoardMember> memberMap = members.stream()
                .collect(Collectors.toMap(BoardMember::getId, m -> m));

        List<String> memberIds = request.getMemberIds();
        for (int i = 0; i < memberIds.size(); i++) {
            BoardMember member = memberMap.get(memberIds.get(i));
            if (member != null) {
                member.updateDisplayOrder(i + 1);
            }
        }

        log.info("Member order updated for board: {} by user: {}", boardId, userId);

        // Re-fetch to return in the new order
        List<BoardMember> updatedMembers = boardMemberRepository.findByBoardId(boardId);
        return MemberResponse.ListResponse.of(updatedMembers);
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

    private void checkOrgSeatLimit(Board board, String userId) {
        String orgId = board.getOrganization().getId();
        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationId(orgId).orElse(null);
        if (orgSub != null && !orgSub.canInviteMember()) {
            boolean isOrgAdmin = orgMemberRepository.findByOrganizationIdAndUserId(orgId, userId)
                    .map(OrganizationMember::isAdminOrAbove)
                    .orElse(false);
            throw new OrgSeatLimitException(
                    orgId, orgSub.getSeatCount(), orgSub.getActiveMemberCount(),
                    OrgSubscription.MONTHLY_PRICE_PER_SEAT, OrgSubscription.YEARLY_PRICE_PER_SEAT,
                    isOrgAdmin);
        }
    }

    public List<MemberResponse.OrgCandidate> getOrgCandidates(String boardId, String userId, String search) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isOrganizationBoard()) {
            return List.of();
        }

        String orgId = board.getOrganization().getId();

        // Get all org members (with JOIN FETCH to avoid N+1)
        List<OrganizationMember> orgMembers = orgMemberRepository.findByOrganizationId(orgId);

        // Get current board member user IDs
        Set<String> boardMemberUserIds = boardMemberRepository.findByBoardId(boardId).stream()
                .map(bm -> bm.getUser().getId())
                .collect(Collectors.toSet());

        // Filter: not already on board, optionally by search term
        return orgMembers.stream()
                .filter(om -> !boardMemberUserIds.contains(om.getUser().getId()))
                .filter(om -> {
                    if (search == null || search.isBlank()) return true;
                    String lowerSearch = search.toLowerCase();
                    return om.getUser().getName().toLowerCase().contains(lowerSearch)
                            || om.getUser().getEmail().toLowerCase().contains(lowerSearch);
                })
                .map(MemberResponse.OrgCandidate::of)
                .collect(Collectors.toList());
    }

    @Transactional
    @CacheEvict(value = "members", key = "#boardId")
    public MemberResponse.ListResponse transferOwnership(String boardId, String userId, MemberRequest.TransferOwnership request) {
        boardService.checkOwner(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User newOwner = userRepository.findById(request.getNewOwnerUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        User oldOwner = board.getOwner();

        if (oldOwner.getId().equals(newOwner.getId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        BoardMember targetMember = boardMemberRepository.findByBoardIdAndUserId(boardId, newOwner.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND));

        targetMember.updateRole(BoardRole.OWNER);

        boardMemberRepository.findByBoardIdAndUserId(boardId, oldOwner.getId())
                .ifPresent(member -> member.updateRole(BoardRole.ADMIN));

        board.updateOwner(newOwner);

        log.info("Board ownership transferred: boardId={}, oldOwner={}, newOwner={}",
                boardId, oldOwner.getId(), newOwner.getId());

        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEMBER_UPDATED,
                userId, oldOwner.getName(), null);

        return MemberResponse.ListResponse.of(boardMemberRepository.findByBoardId(boardId));
    }
}
