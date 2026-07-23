package com.kanban.domain.storage;

import java.security.SecureRandom;

/**
 * 공개 공유 링크용 짧은 base62 코드 생성기.
 * 노트의 share_code 방식과 동일(하이픈 없음 → URL-safe). 62^10 ≈ 8.4e17 → 충돌 무시 가능,
 * DB unique 제약으로 최종 보장.
 */
final class ShareCodes {

    private static final String ALPHABET =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final SecureRandom RNG = new SecureRandom();

    private ShareCodes() {
    }

    static String generate() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(ALPHABET.charAt(RNG.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
