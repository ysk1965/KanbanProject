package com.kanban.global.util;

import net.coobird.thumbnailator.Thumbnails;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/**
 * 이미지 매직바이트 검증 + 썸네일 생성 유틸
 */
public class ImageUtils {

    private static final Map<String, byte[]> MAGIC_BYTES = Map.of(
            "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "image/png", new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47},
            "image/gif", new byte[]{0x47, 0x49, 0x46, 0x38},
            "image/webp", new byte[]{0x52, 0x49, 0x46, 0x46}  // RIFF
    );

    private ImageUtils() {}

    /**
     * 파일의 매직바이트를 검사하여 실제 이미지 파일인지 확인
     */
    public static boolean isValidImageMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 12) return false;

        byte[] expected = MAGIC_BYTES.get(declaredContentType);
        if (expected == null) return false;

        for (int i = 0; i < expected.length; i++) {
            if (fileBytes[i] != expected[i]) return false;
        }

        // WEBP 추가 검증: bytes 8-11이 "WEBP"
        if ("image/webp".equals(declaredContentType)) {
            return fileBytes[8] == 0x57 && fileBytes[9] == 0x45
                    && fileBytes[10] == 0x42 && fileBytes[11] == 0x50;
        }

        return true;
    }

    /**
     * 썸네일 생성 (최대 400x400, JPEG 80%)
     */
    public static byte[] generateThumbnail(byte[] originalBytes, int maxWidth, int maxHeight) throws IOException {
        try (InputStream is = new ByteArrayInputStream(originalBytes);
             ByteArrayOutputStream os = new ByteArrayOutputStream()) {
            Thumbnails.of(is)
                    .size(maxWidth, maxHeight)
                    .outputFormat("jpg")
                    .outputQuality(0.8)
                    .toOutputStream(os);
            return os.toByteArray();
        }
    }

    /**
     * 파일 확장자 추출
     */
    public static String getExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) return "";
        return fileName.substring(fileName.lastIndexOf("."));
    }
}
