package com.kanban.domain.auth.service;

import com.kanban.domain.auth.dto.GoogleAuthRequest;
import com.kanban.domain.auth.dto.LoginRequest;
import com.kanban.domain.auth.dto.SignupRequest;
import com.kanban.domain.auth.dto.TokenResponse;
import com.kanban.domain.user.EmailVerificationToken;
import com.kanban.domain.user.EmailVerificationTokenRepository;
import com.kanban.domain.user.PasswordResetToken;
import com.kanban.domain.user.PasswordResetTokenRepository;
import com.kanban.domain.user.RefreshToken;
import com.kanban.domain.user.RefreshTokenRepository;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.email.EmailService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;
    private final GoogleAuthService googleAuthService;
    private final EmailService emailService;

    private static final int EMAIL_VERIFICATION_EXPIRATION_HOURS = 24;
    private static final int PASSWORD_RESET_EXPIRATION_HOURS = 1;

    @Transactional
    public TokenResponse signup(SignupRequest request) {
        // 이메일 중복 체크
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        // 사용자 생성 (emailVerified = false)
        // cookapps.com 이메일은 TESTER로 설정
        boolean isTester = request.getEmail().toLowerCase().endsWith("@cookapps.com");
        User user = User.builder()
                .id(UUID.randomUUID().toString())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .authProvider("LOCAL")
                .emailVerified(false)
                .systemRole(isTester ? SystemRole.TESTER : SystemRole.USER)
                .build();

        userRepository.saveAndFlush(user);
        log.info("New user created: {}", user.getEmail());

        // 이메일 인증 토큰 생성 및 발송
        EmailVerificationToken verificationToken = EmailVerificationToken.create(user, EMAIL_VERIFICATION_EXPIRATION_HOURS);
        emailVerificationTokenRepository.save(verificationToken);
        emailService.sendVerificationEmail(user.getEmail(), user.getName(), verificationToken.getToken());

        return createTokenResponse(user);
    }

    @Transactional
    public TokenResponse login(LoginRequest request) {
        // 사용자 조회
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        // 비활성화된 계정 체크
        if (!user.getIsActive()) {
            throw new BusinessException(ErrorCode.USER_DEACTIVATED);
        }

        // 비밀번호 검증
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        // 마지막 로그인 시간 업데이트
        user.updateLastLoginAt();
        userRepository.save(user);

        log.info("User logged in: {}", user.getEmail());
        return createTokenResponse(user);
    }

    @Transactional
    public TokenResponse refresh(String refreshToken) {
        // 토큰 유효성 검증 (refresh token 타입인지 확인)
        if (!jwtProvider.validateRefreshToken(refreshToken)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        // DB에서 리프레시 토큰 조회
        RefreshToken storedToken = refreshTokenRepository.findByToken(refreshToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_TOKEN));

        // 만료 여부 확인
        if (storedToken.isExpired()) {
            refreshTokenRepository.delete(storedToken);
            throw new BusinessException(ErrorCode.EXPIRED_TOKEN);
        }

        // 사용자 가져오기 (Lazy loading)
        User user = storedToken.getUser();

        // 기존 토큰 삭제
        refreshTokenRepository.delete(storedToken);

        return createTokenResponse(user);
    }

    @Transactional
    public void logout(String userId) {
        refreshTokenRepository.deleteByUserId(userId);
        log.info("User logged out: {}", userId);
    }

    @Transactional
    public TokenResponse googleLogin(GoogleAuthRequest request) {
        // 1. Google 인증 (auth-code flow 또는 id_token flow)
        GoogleAuthService.GoogleUserInfo googleUserInfo;
        if (request.getCode() != null && !request.getCode().isBlank()) {
            googleUserInfo = googleAuthService.exchangeAuthorizationCode(request.getCode());
        } else if (request.getIdToken() != null && !request.getIdToken().isBlank()) {
            googleUserInfo = googleAuthService.verifyIdToken(request.getIdToken());
        } else {
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
        }

        // 2. 이메일 인증 확인
        if (!Boolean.TRUE.equals(googleUserInfo.getEmailVerified())) {
            throw new BusinessException(ErrorCode.OAUTH_EMAIL_NOT_VERIFIED);
        }

        // 3. Google authProvider + authProviderId로 기존 사용자 검색
        User user = userRepository.findByAuthProviderAndAuthProviderId("GOOGLE", googleUserInfo.getGoogleId())
                .orElse(null);

        if (user != null) {
            // 비활성화된 계정 체크
            if (!user.getIsActive()) {
                throw new BusinessException(ErrorCode.USER_DEACTIVATED);
            }
            // 기존 Google 사용자 - 로그인 처리
            user.updateLastLoginAt();
            userRepository.save(user);
            log.info("Google user logged in: {}", user.getEmail());
            return createTokenResponse(user);
        }

        // 4. 이메일로 기존 사용자 검색 (계정 연동 여부 확인)
        user = userRepository.findByEmail(googleUserInfo.getEmail()).orElse(null);

        if (user != null) {
            // 기존 LOCAL 사용자인 경우 Google 계정 연동
            if ("LOCAL".equals(user.getAuthProvider()) || "email".equals(user.getAuthProvider())) {
                user.linkGoogleAccount(googleUserInfo.getGoogleId(), googleUserInfo.getPictureUrl());
                // Google 로그인으로 연동 시 이메일 인증 완료 처리
                if (!Boolean.TRUE.equals(user.getEmailVerified())) {
                    user.verifyEmail();
                }
                user.updateLastLoginAt();
                userRepository.save(user);
                log.info("Google account linked to existing user: {}", user.getEmail());
                return createTokenResponse(user);
            } else {
                // 다른 OAuth provider로 가입된 경우 (향후 GitHub 등)
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
            }
        }

        // 5. 신규 사용자 생성 (Google 로그인은 이메일 인증 완료 상태)
        // cookapps.com 이메일은 TESTER로 설정
        boolean isTester = googleUserInfo.getEmail().toLowerCase().endsWith("@cookapps.com");
        user = User.builder()
                .id(UUID.randomUUID().toString())
                .email(googleUserInfo.getEmail())
                .name(googleUserInfo.getName())
                .profileImage(googleUserInfo.getPictureUrl())
                .authProvider("GOOGLE")
                .authProviderId(googleUserInfo.getGoogleId())
                .emailVerified(true)
                .systemRole(isTester ? SystemRole.TESTER : SystemRole.USER)
                .build();

        userRepository.save(user);
        log.info("New Google user created: {}", user.getEmail());

        return createTokenResponse(user);
    }

    private TokenResponse createTokenResponse(User user) {
        String systemRole = user.getSystemRole() != null ? user.getSystemRole().name() : "USER";
        String accessToken = jwtProvider.createAccessToken(user.getId(), user.getEmail(), systemRole);
        String refreshToken = jwtProvider.createRefreshToken(user.getId(), user.getEmail(), systemRole);

        // 리프레시 토큰 저장
        RefreshToken refreshTokenEntity = RefreshToken.builder()
                .id(UUID.randomUUID().toString())
                .user(user)
                .token(refreshToken)
                .expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusSeconds(jwtProvider.getRefreshExpiration() / 1000))
                .build();

        refreshTokenRepository.save(refreshTokenEntity);

        // provider 값 변환: GOOGLE -> google, LOCAL/email -> email
        String provider = "GOOGLE".equals(user.getAuthProvider()) ? "google" : "email";

        TokenResponse.UserInfo userInfo = TokenResponse.UserInfo.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .profileImage(user.getProfileImage())
                .emailVerified(user.getEmailVerified())
                .provider(provider)
                .systemRole(systemRole)
                .build();

        return TokenResponse.of(accessToken, refreshToken, userInfo);
    }

    @Transactional
    public void verifyEmail(String token) {
        // 토큰 조회
        EmailVerificationToken verificationToken = emailVerificationTokenRepository.findByToken(token)
                .orElseThrow(() -> new BusinessException(ErrorCode.VERIFICATION_TOKEN_INVALID));

        // 이미 사용된 토큰인지 확인
        if (verificationToken.isUsed()) {
            throw new BusinessException(ErrorCode.VERIFICATION_TOKEN_ALREADY_USED);
        }

        // 만료 여부 확인
        if (verificationToken.isExpired()) {
            throw new BusinessException(ErrorCode.VERIFICATION_TOKEN_EXPIRED);
        }

        // 사용자의 이메일 인증 상태 업데이트
        User user = verificationToken.getUser();

        // 이미 인증된 경우
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            throw new BusinessException(ErrorCode.ALREADY_VERIFIED);
        }

        user.verifyEmail();
        verificationToken.markAsUsed();

        userRepository.save(user);
        emailVerificationTokenRepository.save(verificationToken);

        log.info("Email verified for user: {}", user.getEmail());
    }

    @Transactional
    public void resendVerificationEmail(String email) {
        // 사용자 조회
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 이미 인증된 경우
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            throw new BusinessException(ErrorCode.ALREADY_VERIFIED);
        }

        // 기존 미사용 토큰이 있는지 확인 (Rate limiting)
        emailVerificationTokenRepository.findByUserIdAndUsedAtIsNull(user.getId())
                .ifPresent(existingToken -> {
                    // 1분 이내에 발송된 토큰이 있으면 재발송 불가
                    if (existingToken.getCreatedAt().plusMinutes(1).isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
                        throw new BusinessException(ErrorCode.VERIFICATION_EMAIL_RATE_LIMITED);
                    }
                    // 기존 토큰 삭제
                    emailVerificationTokenRepository.delete(existingToken);
                });

        // 새 토큰 생성 및 발송
        EmailVerificationToken verificationToken = EmailVerificationToken.create(user, EMAIL_VERIFICATION_EXPIRATION_HOURS);
        emailVerificationTokenRepository.save(verificationToken);
        emailService.sendVerificationEmail(user.getEmail(), user.getName(), verificationToken.getToken());

        log.info("Verification email resent to: {}", user.getEmail());
    }

    @Transactional
    public void requestPasswordReset(String email) {
        // 사용자 조회 (존재하지 않아도 에러 메시지로 노출하지 않음 - 보안)
        User user = userRepository.findByEmail(email).orElse(null);

        if (user == null) {
            // 보안상 이유로 사용자가 없어도 성공 메시지 반환
            log.info("Password reset requested for non-existent email: {}", email);
            return;
        }

        // Google 계정은 비밀번호 재설정 불가
        if ("GOOGLE".equals(user.getAuthProvider()) && user.getPasswordHash() == null) {
            log.info("Password reset requested for Google-only account: {}", email);
            return;
        }

        // 기존 미사용 토큰이 있는지 확인 (Rate limiting)
        passwordResetTokenRepository.findByUserIdAndUsedAtIsNull(user.getId())
                .ifPresent(existingToken -> {
                    // 1분 이내에 발송된 토큰이 있으면 재발송 불가
                    if (existingToken.getCreatedAt().plusMinutes(1).isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
                        throw new BusinessException(ErrorCode.PASSWORD_RESET_EMAIL_RATE_LIMITED);
                    }
                    // 기존 토큰 삭제
                    passwordResetTokenRepository.delete(existingToken);
                });

        // 새 토큰 생성 및 발송
        PasswordResetToken resetToken = PasswordResetToken.create(user, PASSWORD_RESET_EXPIRATION_HOURS);
        passwordResetTokenRepository.save(resetToken);
        emailService.sendPasswordResetEmail(user.getEmail(), user.getName(), resetToken.getToken());

        log.info("Password reset email sent to: {}", user.getEmail());
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        // 토큰 조회
        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(token)
                .orElseThrow(() -> new BusinessException(ErrorCode.PASSWORD_RESET_TOKEN_INVALID));

        // 이미 사용된 토큰인지 확인
        if (resetToken.isUsed()) {
            throw new BusinessException(ErrorCode.PASSWORD_RESET_TOKEN_ALREADY_USED);
        }

        // 만료 여부 확인
        if (resetToken.isExpired()) {
            throw new BusinessException(ErrorCode.PASSWORD_RESET_TOKEN_EXPIRED);
        }

        // 비밀번호 업데이트
        User user = resetToken.getUser();
        user.updatePassword(passwordEncoder.encode(newPassword));

        // 토큰 사용 처리
        resetToken.markAsUsed();

        userRepository.save(user);
        passwordResetTokenRepository.save(resetToken);

        // 보안을 위해 해당 사용자의 모든 리프레시 토큰 삭제
        refreshTokenRepository.deleteByUserId(user.getId());

        log.info("Password reset completed for user: {}", user.getEmail());
    }
}
