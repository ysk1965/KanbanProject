package com.kanban.domain.auth.service;

import com.kanban.domain.auth.dto.LoginRequest;
import com.kanban.domain.auth.dto.SignupRequest;
import com.kanban.domain.auth.dto.TokenResponse;
import com.kanban.domain.user.RefreshToken;
import com.kanban.domain.user.RefreshTokenRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    @Transactional
    public TokenResponse signup(SignupRequest request) {
        // 이메일 중복 체크
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        // 사용자 생성
        User user = User.builder()
                .id(UUID.randomUUID().toString())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .authProvider("LOCAL")
                .build();

        userRepository.save(user);
        log.info("New user created: {}", user.getEmail());

        return createTokenResponse(user);
    }

    @Transactional
    public TokenResponse login(LoginRequest request) {
        // 사용자 조회
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

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
        // 토큰 유효성 검증
        if (!jwtProvider.validateToken(refreshToken)) {
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

    private TokenResponse createTokenResponse(User user) {
        String accessToken = jwtProvider.createAccessToken(user.getId(), user.getEmail());
        String refreshToken = jwtProvider.createRefreshToken(user.getId(), user.getEmail());

        // 리프레시 토큰 저장
        RefreshToken refreshTokenEntity = RefreshToken.builder()
                .id(UUID.randomUUID().toString())
                .user(user)
                .token(refreshToken)
                .expiresAt(LocalDateTime.now().plusSeconds(jwtProvider.getRefreshExpiration() / 1000))
                .build();

        refreshTokenRepository.save(refreshTokenEntity);

        TokenResponse.UserInfo userInfo = TokenResponse.UserInfo.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .profileImage(user.getProfileImage())
                .build();

        return TokenResponse.of(accessToken, refreshToken, userInfo);
    }
}
