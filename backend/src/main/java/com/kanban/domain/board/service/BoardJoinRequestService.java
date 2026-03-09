package com.kanban.domain.board.service;

import com.kanban.domain.board.*;
import com.kanban.domain.board.dto.BoardJoinRequestDTO;
import com.kanban.domain.notification.Notification;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.dto.NotificationResponse;
import com.kanban.domain.notification.service.PushNotificationService;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardJoinRequestService {

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardJoinRequestRepository boardJoinRequestRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final WebSocketEventService webSocketEventService;
    private final PushNotificationService pushNotificationService;

    @Transactional
    public BoardJoinRequestDTO.Detail createJoinRequest(String boardId, String userId, String message) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User requester = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 조직 보드인지 확인
        if (!board.isOrganizationBoard()) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_ORG_MEMBER);
        }

        // 조직 멤버인지 확인
        if (!orgMemberRepository.existsByOrganizationIdAndUserId(
                board.getOrganization().getId(), userId)) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_ORG_MEMBER);
        }

        // 이미 보드 멤버인지 확인
        if (boardMemberRepository.existsByBoardIdAndUserId(boardId, userId)) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_ALREADY_MEMBER);
        }

        // 이미 대기 중인 요청이 있는지 확인
        if (boardJoinRequestRepository.existsByBoardIdAndRequesterIdAndStatus(
                boardId, userId, JoinRequestStatus.PENDING)) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_ALREADY_EXISTS);
        }

        BoardJoinRequest joinRequest = BoardJoinRequest.builder()
                .board(board)
                .requester(requester)
                .message(message)
                .build();

        boardJoinRequestRepository.save(joinRequest);
        log.info("Board join request created: board={}, user={}", boardId, userId);

        // 보드 admin/owner에게 알림 전송
        notifyBoardAdmins(board, requester);

        return BoardJoinRequestDTO.Detail.of(joinRequest);
    }

    public BoardJoinRequestDTO.ListResponse getJoinRequests(String boardId, String userId) {
        // admin/owner 권한 확인
        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        if (!membership.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        List<BoardJoinRequest> requests = boardJoinRequestRepository
                .findByBoardIdAndStatus(boardId, JoinRequestStatus.PENDING);

        return BoardJoinRequestDTO.ListResponse.builder()
                .requests(requests.stream()
                        .map(BoardJoinRequestDTO.Detail::of)
                        .toList())
                .build();
    }

    @Transactional
    public BoardJoinRequestDTO.Detail approveRequest(String boardId, String requestId, String reviewerId) {
        BoardMember reviewerMembership = boardMemberRepository.findByBoardIdAndUserId(boardId, reviewerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        if (!reviewerMembership.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        BoardJoinRequest joinRequest = boardJoinRequestRepository.findById(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND));

        if (!joinRequest.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND);
        }

        if (!joinRequest.isPending()) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND);
        }

        User reviewer = userRepository.findById(reviewerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        joinRequest.approve(reviewer);

        // 보드 멤버로 추가
        BoardMember newMember = BoardMember.builder()
                .board(joinRequest.getBoard())
                .user(joinRequest.getRequester())
                .role(BoardRole.MEMBER)
                .invitedBy(reviewer)
                .build();
        boardMemberRepository.save(newMember);

        log.info("Board join request approved: request={}, board={}, user={}",
                requestId, boardId, joinRequest.getRequester().getId());

        // 신청자에게 승인 알림
        notifyRequester(joinRequest.getBoard(), joinRequest.getRequester(), reviewer, true);

        // WebSocket: 멤버 추가 이벤트
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEMBER_JOINED,
                joinRequest.getRequester().getId(), joinRequest.getRequester().getName(), null);

        return BoardJoinRequestDTO.Detail.of(joinRequest);
    }

    @Transactional
    public BoardJoinRequestDTO.Detail rejectRequest(String boardId, String requestId, String reviewerId) {
        BoardMember reviewerMembership = boardMemberRepository.findByBoardIdAndUserId(boardId, reviewerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        if (!reviewerMembership.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        BoardJoinRequest joinRequest = boardJoinRequestRepository.findById(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND));

        if (!joinRequest.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND);
        }

        if (!joinRequest.isPending()) {
            throw new BusinessException(ErrorCode.JOIN_REQUEST_NOT_FOUND);
        }

        User reviewer = userRepository.findById(reviewerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        joinRequest.reject(reviewer);

        log.info("Board join request rejected: request={}, board={}, user={}",
                requestId, boardId, joinRequest.getRequester().getId());

        // 신청자에게 거절 알림
        notifyRequester(joinRequest.getBoard(), joinRequest.getRequester(), reviewer, false);

        return BoardJoinRequestDTO.Detail.of(joinRequest);
    }

    public int getPendingCount(String boardId) {
        return boardJoinRequestRepository.countByBoardIdAndStatus(boardId, JoinRequestStatus.PENDING);
    }

    private void notifyBoardAdmins(Board board, User requester) {
        List<BoardMember> admins = boardMemberRepository.findByBoardId(board.getId()).stream()
                .filter(BoardMember::isAdminOrAbove)
                .toList();

        for (BoardMember admin : admins) {
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("senderName", requester.getName());
            metadata.put("senderProfileImage", requester.getProfileImage() != null ? requester.getProfileImage() : "");
            metadata.put("boardName", board.getName());
            metadata.put("requestType", "join_request");

            Notification notification = Notification.builder()
                    .recipient(admin.getUser())
                    .board(board)
                    .type(NotificationType.BOARD_JOIN_REQUEST)
                    .title(requester.getName() + "님이 보드 참가를 요청했습니다")
                    .message(board.getName())
                    .senderId(requester.getId())
                    .metadata(metadata)
                    .build();

            notificationRepository.save(notification);

            NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
            webSocketEventService.sendUserEvent(
                    board.getId(), admin.getUser().getId(),
                    BoardEventType.NOTIFICATION_CREATED, response);

            pushNotificationService.sendPushForNotification(notification);
        }
    }

    private void notifyRequester(Board board, User requester, User reviewer, boolean approved) {
        NotificationType type = approved
                ? NotificationType.BOARD_JOIN_APPROVED
                : NotificationType.BOARD_JOIN_REJECTED;

        String title = approved
                ? board.getName() + " 보드 참가가 승인되었습니다"
                : board.getName() + " 보드 참가가 거절되었습니다";

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("senderName", reviewer.getName());
        metadata.put("senderProfileImage", reviewer.getProfileImage() != null ? reviewer.getProfileImage() : "");
        metadata.put("boardName", board.getName());
        metadata.put("boardId", board.getId());

        Notification notification = Notification.builder()
                .recipient(requester)
                .board(board)
                .type(type)
                .title(title)
                .message(board.getName())
                .senderId(reviewer.getId())
                .metadata(metadata)
                .build();

        notificationRepository.save(notification);

        NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
        webSocketEventService.sendUserEvent(
                board.getId(), requester.getId(),
                BoardEventType.NOTIFICATION_CREATED, response);

        pushNotificationService.sendPushForNotification(notification);
    }
}
