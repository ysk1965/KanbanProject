package com.kanban.domain.auth.pat;

import com.kanban.domain.auth.pat.dto.PatDto;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PatService {

    private static final String TOKEN_PREFIX = "bsp_";
    private static final int RANDOM_BYTES = 32;
    private static final int PREFIX_DISPLAY_LEN = 12;
    private static final int MAX_ACTIVE_TOKENS = 20;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final PersonalAccessTokenRepository patRepository;
    private final UserRepository userRepository;

    /** PAT 발급. 원문 토큰은 이 반환값에서만 확인 가능하다. */
    @Transactional
    public PatDto.Created create(String userId, PatDto.Create request) {
        if (patRepository.countByUserIdAndRevokedAtIsNull(userId) >= MAX_ACTIVE_TOKENS) {
            throw new BusinessException(ErrorCode.PAT_LIMIT_EXCEEDED);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String rawToken = generateRawToken();
        String name = (request.getName() == null || request.getName().isBlank())
                ? "MCP Token" : request.getName().trim();
        LocalDateTime expiresAt = request.getExpiresInDays() == null ? null
                : LocalDateTime.now(ZoneOffset.UTC).plusDays(request.getExpiresInDays());

        PersonalAccessToken pat = PersonalAccessToken.builder()
                .tokenHash(sha256Hex(rawToken))
                .tokenPrefix(rawToken.substring(0, PREFIX_DISPLAY_LEN))
                .name(name)
                .user(user)
                .expiresAt(expiresAt)
                .build();

        patRepository.save(pat);
        log.info("PAT issued: user={} name={} prefix={}", userId, name, pat.getTokenPrefix());
        return PatDto.Created.of(pat, rawToken);
    }

    @Transactional(readOnly = true)
    public List<PatDto.Response> list(String userId) {
        return patRepository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(userId).stream()
                .filter(pat -> !pat.isExpired())
                .map(PatDto.Response::of)
                .toList();
    }

    @Transactional
    public void revoke(String userId, String tokenId) {
        PersonalAccessToken pat = patRepository.findByIdAndUserId(tokenId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAT_NOT_FOUND));
        pat.revoke();
    }

    /**
     * 원문 PAT 를 {@link UserPrincipal} 로 해석한다. JwtAuthenticationFilter 가
     * JWT 검증 실패 시 폴백으로 호출한다. 유효하지 않으면 {@link Optional#empty()}.
     */
    @Transactional
    public Optional<UserPrincipal> authenticate(String rawToken) {
        if (rawToken == null || !rawToken.startsWith(TOKEN_PREFIX)) {
            return Optional.empty();
        }
        return patRepository.findByTokenHash(sha256Hex(rawToken))
                .filter(PersonalAccessToken::isActive)
                .map(pat -> {
                    pat.touchLastUsed();
                    User user = pat.getUser();
                    return new UserPrincipal(user.getId(), user.getEmail(), user.getSystemRole());
                });
    }

    // ===== helpers =====

    private String generateRawToken() {
        byte[] bytes = new byte[RANDOM_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return TOKEN_PREFIX + B64.encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
