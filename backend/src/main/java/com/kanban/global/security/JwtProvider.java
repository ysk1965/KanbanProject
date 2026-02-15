package com.kanban.global.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Date;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtProvider {

    private static final String INSECURE_DEFAULT_PREFIX = "your-super-secret";

    @Value("${jwt.secret}")
    private String secretKeyString;

    @Value("${jwt.access-expiration}")
    private long accessExpiration;

    @Value("${jwt.refresh-expiration}")
    private long refreshExpiration;

    private final Environment environment;

    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        String[] activeProfiles = environment.getActiveProfiles();
        boolean isProduction = Arrays.stream(activeProfiles)
                .anyMatch(p -> p.equals("prod") || p.equals("dev"));

        if (isProduction && secretKeyString.startsWith(INSECURE_DEFAULT_PREFIX)) {
            throw new IllegalStateException(
                    "JWT secret is using insecure default value. Set JWT_SECRET environment variable for production.");
        }

        if (secretKeyString.startsWith(INSECURE_DEFAULT_PREFIX)) {
            log.warn("JWT secret is using insecure default value. This is only acceptable for local development.");
        }

        this.secretKey = Keys.hmacShaKeyFor(secretKeyString.getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(String userId, String email, String systemRole) {
        return createToken(userId, email, systemRole, accessExpiration);
    }

    public String createRefreshToken(String userId, String email, String systemRole) {
        return createToken(userId, email, systemRole, refreshExpiration);
    }

    private String createToken(String userId, String email, String systemRole, long expiration) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .claim("systemRole", systemRole)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(secretKey)
                .compact();
    }

    public String getUserIdFromToken(String token) {
        return getClaims(token).getSubject();
    }

    public String getEmailFromToken(String token) {
        return getClaims(token).get("email", String.class);
    }

    public String getSystemRoleFromToken(String token) {
        String role = getClaims(token).get("systemRole", String.class);
        return role != null ? role : "USER";
    }

    public boolean validateToken(String token) {
        try {
            getClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.warn("Expired JWT token");
        } catch (UnsupportedJwtException e) {
            log.warn("Unsupported JWT token");
        } catch (MalformedJwtException e) {
            log.warn("Malformed JWT token");
        } catch (SecurityException e) {
            log.warn("Invalid JWT signature");
        } catch (IllegalArgumentException e) {
            log.warn("JWT token compact of handler are invalid");
        }
        return false;
    }

    public boolean isTokenExpired(String token) {
        try {
            getClaims(token);
            return false;
        } catch (ExpiredJwtException e) {
            return true;
        }
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public long getRefreshExpiration() {
        return refreshExpiration;
    }
}
