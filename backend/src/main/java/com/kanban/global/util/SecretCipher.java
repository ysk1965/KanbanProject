package com.kanban.global.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * DB에 저장하는 민감 설정값(AI API 키 등)을 AES-GCM으로 감싼다.
 *
 * <p>{@code system_config.config_value}는 평문 TEXT라 RDS 스냅샷·덤프에 그대로 남는다.
 * 저장 전 이 클래스로 암호화해서, DB 접근만으로는 키를 복원할 수 없게 한다.
 *
 * <p><b>키가 설정돼 있지 않으면 암호화를 거부한다.</b> {@code SlackTokenEncryptor}처럼
 * 랜덤 키로 폴백하면 재기동 후 복호화가 깨지는데, AI API 키의 경우 그 시점에
 * 전 서비스 AI 기능이 조용히 죽는다. 저장 자체를 막고 운영자에게 알리는 편이 낫다.
 */
@Slf4j
@Component
public class SecretCipher {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    /** 암호문 앞에 붙는 마커. 평문으로 남아 있던 레거시 값과 구분한다. */
    public static final String PREFIX = "enc:v1:";

    private final SecretKeySpec keySpec;

    public SecretCipher(@Value("${app.config-encryption-key:}") String configuredKey) {
        this.keySpec = (configuredKey == null || configuredKey.isBlank())
                ? null
                : new SecretKeySpec(deriveKeyBytes(configuredKey), "AES");
        if (this.keySpec == null) {
            log.warn("app.config-encryption-key (CONFIG_ENCRYPTION_KEY) 미설정 — "
                    + "민감 설정값의 DB 저장이 비활성화됩니다.");
        }
    }

    /**
     * base64로 인코딩된 16/24/32바이트 키를 우선 시도하고, 아니면 SHA-256으로 32바이트를 유도한다.
     * 운영자가 임의 문자열을 넣어도 동작하되, base64 32바이트 키를 권장한다.
     */
    private static byte[] deriveKeyBytes(String configuredKey) {
        try {
            byte[] decoded = Base64.getDecoder().decode(configuredKey);
            if (decoded.length == 16 || decoded.length == 24 || decoded.length == 32) {
                return decoded;
            }
        } catch (IllegalArgumentException ignored) {
            // base64가 아니면 아래 SHA-256 유도로 넘어간다
        }
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(configuredKey.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("암호화 키 유도에 실패했습니다", e);
        }
    }

    /** 암호화 키가 설정돼 있어 저장이 가능한 상태인지. */
    public boolean isConfigured() {
        return keySpec != null;
    }

    /** 평문을 {@code enc:v1:<base64(iv||ciphertext)>} 형태로 감싼다. */
    public String encrypt(String plainText) {
        if (!isConfigured()) {
            throw new IllegalStateException("CONFIG_ENCRYPTION_KEY가 설정되지 않았습니다");
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            ByteBuffer buffer = ByteBuffer.allocate(iv.length + encrypted.length);
            buffer.put(iv);
            buffer.put(encrypted);
            return PREFIX + Base64.getEncoder().encodeToString(buffer.array());
        } catch (Exception e) {
            throw new IllegalStateException("설정값 암호화에 실패했습니다", e);
        }
    }

    /**
     * {@link #encrypt}로 감싼 값을 복원한다. 접두사가 없으면 평문으로 보고 그대로 돌려준다
     * (암호화 도입 이전에 저장된 값 호환).
     *
     * @return 복호화된 평문. 복호화에 실패하면 {@code null}
     */
    public String decrypt(String storedValue) {
        if (storedValue == null || storedValue.isBlank()) {
            return null;
        }
        if (!storedValue.startsWith(PREFIX)) {
            return storedValue;
        }
        if (!isConfigured()) {
            log.error("암호화된 설정값이 있으나 CONFIG_ENCRYPTION_KEY가 없어 복호화할 수 없습니다");
            return null;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(storedValue.substring(PREFIX.length()));
            ByteBuffer buffer = ByteBuffer.wrap(decoded);

            byte[] iv = new byte[GCM_IV_LENGTH];
            buffer.get(iv);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // 키가 교체됐거나 값이 손상된 경우. 원문을 로그에 남기지 않는다.
            log.error("설정값 복호화에 실패했습니다: {}", e.getMessage());
            return null;
        }
    }
}
