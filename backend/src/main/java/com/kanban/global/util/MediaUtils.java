package com.kanban.global.util;

import net.coobird.thumbnailator.Thumbnails;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;

/**
 * 미디어(이미지+영상) 매직바이트 검증 + 이미지 썸네일 생성 유틸
 */
public class MediaUtils {

    private static final Map<String, byte[]> IMAGE_MAGIC_BYTES = Map.of(
            "image/jpeg", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},
            "image/png", new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47},
            "image/gif", new byte[]{0x47, 0x49, 0x46, 0x38},
            "image/webp", new byte[]{0x52, 0x49, 0x46, 0x46}  // RIFF
    );

    private static final Set<String> VIDEO_TYPES = Set.of(
            "video/mp4", "video/webm", "video/quicktime"
    );

    private static final Set<String> IMAGE_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp"
    );

    private MediaUtils() {}

    /**
     * 파일의 매직바이트를 검사하여 실제 미디어 파일인지 확인 (이미지 + 영상)
     */
    public static boolean isValidMediaMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 12) return false;

        if (isImageType(declaredContentType)) {
            return isValidImageMagicBytes(fileBytes, declaredContentType);
        }

        if (isVideoType(declaredContentType)) {
            return isValidVideoMagicBytes(fileBytes, declaredContentType);
        }

        return false;
    }

    /**
     * 이미지 매직바이트 검증
     */
    public static boolean isValidImageMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 12) return false;

        byte[] expected = IMAGE_MAGIC_BYTES.get(declaredContentType);
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
     * 영상 매직바이트 검증
     */
    public static boolean isValidVideoMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 12) return false;

        return switch (declaredContentType) {
            case "video/mp4", "video/quicktime" -> {
                // MP4/MOV: bytes 4-7 = "ftyp"
                yield fileBytes[4] == 0x66 && fileBytes[5] == 0x74
                        && fileBytes[6] == 0x79 && fileBytes[7] == 0x70;
            }
            case "video/webm" -> {
                // WebM (EBML): bytes 0-3 = 0x1A 0x45 0xDF 0xA3
                yield fileBytes[0] == 0x1A && fileBytes[1] == 0x45
                        && (fileBytes[2] & 0xFF) == 0xDF && (fileBytes[3] & 0xFF) == 0xA3;
            }
            default -> false;
        };
    }

    /**
     * 영상 타입 여부
     */
    public static boolean isVideoType(String contentType) {
        return contentType != null && VIDEO_TYPES.contains(contentType);
    }

    /**
     * 이미지 타입 여부
     */
    public static boolean isImageType(String contentType) {
        return contentType != null && IMAGE_TYPES.contains(contentType);
    }

    /**
     * 이미지 썸네일 생성 (최대 400x400, JPEG 80%)
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
