package com.kanban.domain.user.service;

import com.kanban.domain.activity.ActivityLogRepository;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.board.UserBoardStarRepository;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.invite.InviteLinkRepository;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.milestone.MilestoneAllocationRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.EmailVerificationTokenRepository;
import com.kanban.domain.user.PasswordResetTokenRepository;
import com.kanban.domain.user.RefreshTokenRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.user.dto.ChangePasswordRequest;
import com.kanban.domain.user.dto.UpdateProfileRequest;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final FileUploadService fileUploadService;
    private final NotificationRepository notificationRepository;
    private final ActivityLogRepository activityLogRepository;
    private final UserBoardStarRepository userBoardStarRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final CommentRepository commentRepository;
    private final MilestoneRepository milestoneRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final InviteLinkRepository inviteLinkRepository;
    private final OrganizationRepository organizationRepository;

    public User getUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    @Transactional
    public User updateProfile(String userId, UpdateProfileRequest request) {
        User user = getUser(userId);

        user.updateProfile(request.getName(), request.getProfileImage());
        user.updateTheme(request.getTheme());
        userRepository.save(user);

        log.info("Profile updated for user: {}", user.getEmail());
        return user;
    }

    @Transactional
    public User updateProfileImage(String userId, MultipartFile file) {
        fileUploadService.validateFile(file);
        User user = getUser(userId);

        // 기존 이미지 삭제
        deleteOldProfileImage(user);

        // 새 이미지 업로드
        String extension = MediaUtils.getExtension(file.getOriginalFilename());
        String key = String.format("profiles/%s/%s%s", userId, UUID.randomUUID(), extension);
        String url = fileUploadService.uploadDirect(file, key);

        user.updateProfileImage(url);
        userRepository.save(user);

        log.info("Profile image updated for user: {}", user.getEmail());
        return user;
    }

    @Transactional
    public User deleteProfileImage(String userId) {
        User user = getUser(userId);
        deleteOldProfileImage(user);
        user.clearProfileImage();
        userRepository.save(user);

        log.info("Profile image deleted for user: {}", user.getEmail());
        return user;
    }

    private void deleteOldProfileImage(User user) {
        String oldImage = user.getProfileImage();
        if (oldImage == null || oldImage.isEmpty()) return;
        // Google OAuth 이미지는 삭제하지 않음
        if (oldImage.contains("googleusercontent.com") || oldImage.contains("googleapis.com")) return;

        try {
            String key = extractKeyFromUrl(oldImage);
            if (key != null) {
                fileUploadService.delete(key);
            }
        } catch (Exception e) {
            log.warn("Failed to delete old profile image: {}", oldImage, e);
        }
    }

    private String extractKeyFromUrl(String url) {
        if (url.startsWith("/uploads/")) return url.substring("/uploads/".length());
        try {
            String path = new URI(url).getPath();
            return path.startsWith("/") ? path.substring(1) : path;
        } catch (Exception e) {
            return null;
        }
    }

    @Transactional
    public void changePassword(String userId, ChangePasswordRequest request) {
        User user = getUser(userId);

        // Google 전용 계정은 비밀번호 변경 불가
        if ("GOOGLE".equals(user.getAuthProvider()) && user.getPasswordHash() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 현재 비밀번호 확인
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.CURRENT_PASSWORD_MISMATCH);
        }

        // 새 비밀번호로 업데이트
        user.updatePassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        // 보안을 위해 모든 리프레시 토큰 삭제 (현재 세션 제외하려면 별도 처리 필요)
        refreshTokenRepository.deleteByUserId(userId);

        log.info("Password changed for user: {}", user.getEmail());
    }

    @Transactional
    public void deleteAccount(String userId) {
        User user = getUser(userId);

        // 조직 Owner인 경우 탈퇴 불가
        if (organizationRepository.existsByOwnerIdAndDeletedAtIsNull(userId)) {
            throw new BusinessException(ErrorCode.CANNOT_DEACTIVATE_ORG_OWNER);
        }

        // 보드 Owner인 경우 탈퇴 불가
        if (boardMemberRepository.existsByUserIdAndRole(userId, BoardRole.OWNER)) {
            throw new BusinessException(ErrorCode.CANNOT_DELETE_BOARD_OWNER);
        }

        // 관련 데이터 정리 (FK 의존성 순서: leaf → parent)
        // 1. 인증 토큰 삭제
        refreshTokenRepository.deleteByUserId(userId);
        emailVerificationTokenRepository.deleteByUserId(userId);
        passwordResetTokenRepository.deleteByUserId(userId);

        // 2. 사용자 전용 데이터 삭제 (다른 사용자와 무관한 데이터)
        notificationRepository.deleteByRecipientId(userId);
        activityLogRepository.deleteByUserId(userId);
        userBoardStarRepository.deleteByUserId(userId);
        milestoneAllocationRepository.deleteByMemberId(userId);
        scheduleBlockRepository.deleteByAssigneeId(userId);
        dailyChecklistRepository.deleteByAssigneeId(userId);

        // 3. 참조 필드 NULL 처리 (다른 사용자의 데이터는 보존, 참조만 해제)
        featureRepository.nullifyAssigneeByUserId(userId);
        featureRepository.nullifyCreatedByUserId(userId);
        taskRepository.nullifyCreatedByUserId(userId);
        commentRepository.nullifyAuthorByUserId(userId);
        milestoneRepository.nullifyCreatedByUserId(userId);
        checklistItemRepository.nullifyAssigneeByUserId(userId);
        inviteLinkRepository.nullifyCreatedByUserId(userId);
        boardMemberRepository.nullifyInvitedByUserId(userId);

        // 4. 보드 멤버십 삭제 (Owner가 아닌 것은 이미 확인됨)
        boardMemberRepository.deleteByUserId(userId);

        // 5. 사용자 삭제
        userRepository.delete(user);

        log.info("Account deleted for user: {}", user.getEmail());
    }
}
