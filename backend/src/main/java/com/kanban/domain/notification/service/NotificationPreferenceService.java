package com.kanban.domain.notification.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.notification.NotificationPreference;
import com.kanban.domain.notification.NotificationPreferenceRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.dto.NotificationPreferenceRequest;
import com.kanban.domain.notification.dto.NotificationPreferenceResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationPreferenceService {

    private final NotificationPreferenceRepository preferenceRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;

    public NotificationPreferenceResponse.Detail getMyPreferences(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        return preferenceRepository.findByBoardIdAndUserId(boardId, userId)
                .map(NotificationPreferenceResponse.Detail::of)
                .orElse(NotificationPreferenceResponse.Detail.defaultPreference(boardId));
    }

    @Transactional
    public NotificationPreferenceResponse.Detail upsertMyPreferences(String boardId, String userId,
                                                                      NotificationPreferenceRequest.Update request) {
        boardService.checkViewerOrAbove(boardId, userId);

        NotificationPreference preference = preferenceRepository.findByBoardIdAndUserId(boardId, userId)
                .orElse(null);

        if (preference != null) {
            preference.update(
                    request.getCommentMentionEnabled(),
                    request.getChecklistAssignedEnabled(),
                    request.getTaskCommentEnabled(),
                    request.getSlackCommentMentionEnabled(),
                    request.getSlackChecklistAssignedEnabled(),
                    request.getSlackTaskCommentEnabled(),
                    request.getMeetingMemoSharedEnabled(),
                    request.getSlackMeetingMemoSharedEnabled()
            );
        } else {
            Board board = boardRepository.findById(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

            preference = NotificationPreference.builder()
                    .board(board)
                    .user(user)
                    .commentMentionEnabled(request.getCommentMentionEnabled() != null ? request.getCommentMentionEnabled() : true)
                    .checklistAssignedEnabled(request.getChecklistAssignedEnabled() != null ? request.getChecklistAssignedEnabled() : true)
                    .taskCommentEnabled(request.getTaskCommentEnabled() != null ? request.getTaskCommentEnabled() : true)
                    .slackCommentMentionEnabled(request.getSlackCommentMentionEnabled() != null ? request.getSlackCommentMentionEnabled() : true)
                    .slackChecklistAssignedEnabled(request.getSlackChecklistAssignedEnabled() != null ? request.getSlackChecklistAssignedEnabled() : true)
                    .slackTaskCommentEnabled(request.getSlackTaskCommentEnabled() != null ? request.getSlackTaskCommentEnabled() : true)
                    .meetingMemoSharedEnabled(request.getMeetingMemoSharedEnabled() != null ? request.getMeetingMemoSharedEnabled() : true)
                    .slackMeetingMemoSharedEnabled(request.getSlackMeetingMemoSharedEnabled() != null ? request.getSlackMeetingMemoSharedEnabled() : true)
                    .build();
        }

        preferenceRepository.save(preference);
        log.info("Notification preferences upserted for user {} on board {}", userId, boardId);
        return NotificationPreferenceResponse.Detail.of(preference);
    }

    public boolean isInAppEnabled(String userId, String boardId, NotificationType type) {
        return preferenceRepository.findByBoardIdAndUserId(boardId, userId)
                .map(p -> p.isInAppEnabled(type))
                .orElse(true);
    }

    public boolean isSlackEnabled(String userId, String boardId, NotificationType type) {
        return preferenceRepository.findByBoardIdAndUserId(boardId, userId)
                .map(p -> p.isSlackEnabled(type))
                .orElse(true);
    }

    public Map<String, NotificationPreference> getPreferencesForUsers(String boardId, List<String> userIds) {
        return preferenceRepository.findByBoardIdAndUserIdIn(boardId, userIds).stream()
                .collect(Collectors.toMap(p -> p.getUser().getId(), p -> p));
    }
}
