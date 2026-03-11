package com.kanban.domain.integration.slack.service;

import com.kanban.domain.integration.slack.config.SlackAppConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

@Slf4j
@Component
public class SlackTokenEncryptor {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    private final SecretKeySpec keySpec;

    public SlackTokenEncryptor(SlackAppConfig config) {
        String key = config.getTokenEncryptionKey();
        if (key != null && !key.isBlank()) {
            byte[] keyBytes = Base64.getDecoder().decode(key);
            this.keySpec = new SecretKeySpec(keyBytes, "AES");
        } else {
            // Development fallback - generate a random key (tokens won't survive restart)
            byte[] keyBytes = new byte[32];
            new SecureRandom().nextBytes(keyBytes);
            this.keySpec = new SecretKeySpec(keyBytes, "AES");
            log.warn("No Slack token encryption key configured. Using random key (tokens won't survive restart).");
        }
    }

    public String encrypt(String plainText) {
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            ByteBuffer byteBuffer = ByteBuffer.allocate(iv.length + encrypted.length);
            byteBuffer.put(iv);
            byteBuffer.put(encrypted);
            return Base64.getEncoder().encodeToString(byteBuffer.array());
        } catch (Exception e) {
            throw new RuntimeException("Failed to encrypt Slack token", e);
        }
    }

    public String decrypt(String encryptedText) {
        try {
            byte[] decoded = Base64.getDecoder().decode(encryptedText);
            ByteBuffer byteBuffer = ByteBuffer.wrap(decoded);

            byte[] iv = new byte[GCM_IV_LENGTH];
            byteBuffer.get(iv);
            byte[] encrypted = new byte[byteBuffer.remaining()];
            byteBuffer.get(encrypted);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Failed to decrypt Slack token", e);
        }
    }

    /**
     * Safely decrypt - returns original text if decryption fails (for plaintext migration compatibility).
     */
    public String safeDecrypt(String text) {
        if (text == null || text.isBlank()) return text;
        try {
            return decrypt(text);
        } catch (Exception e) {
            // Likely plaintext (pre-encryption migration data)
            log.debug("Token appears to be plaintext, returning as-is");
            return text;
        }
    }
}
