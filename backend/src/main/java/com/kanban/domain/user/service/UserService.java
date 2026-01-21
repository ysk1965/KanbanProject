package com.kanban.domain.user.service;

import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.Role;
import com.kanban.domain.user.EmailVerificationTokenRepository;
import com.kanban.domain.user.PasswordResetTokenRepository;
import com.kanban.domain.user.RefreshTokenRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.user.dto.ChangePasswordRequest;
import com.kanban.domain.user.dto.UpdateProfileRequest;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

        // 보드 Owner인 경우 탈퇴 불가
        if (boardMemberRepository.existsByUserIdAndRole(userId, Role.OWNER)) {
            throw new BusinessException(ErrorCode.CANNOT_DELETE_BOARD_OWNER);
        }

        // 관련 데이터 정리
        // 1. 리프레시 토큰 삭제
        refreshTokenRepository.deleteByUserId(userId);

        // 2. 이메일 인증 토큰 삭제
        emailVerificationTokenRepository.deleteByUserId(userId);

        // 3. 비밀번호 재설정 토큰 삭제
        passwordResetTokenRepository.deleteByUserId(userId);

        // 4. 보드 멤버십 삭제 (Owner가 아닌 것은 이미 확인됨)
        boardMemberRepository.deleteByUserId(userId);

        // 5. 사용자 삭제
        userRepository.delete(user);

        log.info("Account deleted for user: {}", user.getEmail());
    }
}
