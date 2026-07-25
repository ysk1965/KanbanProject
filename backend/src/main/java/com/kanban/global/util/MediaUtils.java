package com.kanban.global.util;

import net.coobird.thumbnailator.Thumbnails;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;

/**
 * 미디어(이미지+영상+문서) 매직바이트 검증 + 이미지 썸네일 생성 유틸
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

    private static final Set<String> DOCUMENT_TYPES = Set.of(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/markdown"
    );

    // PDF: %PDF
    private static final byte[] PDF_MAGIC = new byte[]{0x25, 0x50, 0x44, 0x46};
    // OOXML (docx, xlsx, pptx): ZIP header
    private static final byte[] ZIP_MAGIC = new byte[]{0x50, 0x4B, 0x03, 0x04};
    // OLE2 (doc, xls, ppt): Compound Document
    private static final byte[] OLE2_MAGIC = new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0};

    private MediaUtils() {}

    /**
     * InputStream의 첫 N바이트만 읽어 매직바이트 검증 (메모리 효율적)
     */
    public static boolean isValidMediaMagicBytes(InputStream inputStream, String declaredContentType) throws IOException {
        if (inputStream == null) return false;
        byte[] header = inputStream.readNBytes(12);
        return isValidMediaMagicBytes(header, declaredContentType);
    }

    /**
     * 파일의 매직바이트를 검사하여 실제 파일인지 확인 (이미지 + 영상 + 문서)
     */
    public static boolean isValidMediaMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 4) return false;

        if (isImageType(declaredContentType)) {
            return fileBytes.length >= 12 && isValidImageMagicBytes(fileBytes, declaredContentType);
        }

        if (isVideoType(declaredContentType)) {
            return fileBytes.length >= 12 && isValidVideoMagicBytes(fileBytes, declaredContentType);
        }

        if (isDocumentType(declaredContentType)) {
            return isValidDocumentMagicBytes(fileBytes, declaredContentType);
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
     * 문서 타입 여부
     */
    public static boolean isDocumentType(String contentType) {
        return contentType != null && DOCUMENT_TYPES.contains(contentType);
    }

    /**
     * 문서 매직바이트 검증
     */
    public static boolean isValidDocumentMagicBytes(byte[] fileBytes, String declaredContentType) {
        if (fileBytes == null || fileBytes.length < 4) return false;

        // 텍스트 계열은 매직바이트 검증 스킵
        if ("text/plain".equals(declaredContentType) || "text/markdown".equals(declaredContentType)) {
            return true;
        }

        // PDF
        if ("application/pdf".equals(declaredContentType)) {
            return startsWith(fileBytes, PDF_MAGIC);
        }

        // OOXML (docx, xlsx, pptx) — ZIP 기반
        if (declaredContentType.startsWith("application/vnd.openxmlformats-officedocument.")) {
            return startsWith(fileBytes, ZIP_MAGIC);
        }

        // OLE2 (doc, xls, ppt)
        if ("application/msword".equals(declaredContentType)
                || "application/vnd.ms-excel".equals(declaredContentType)
                || "application/vnd.ms-powerpoint".equals(declaredContentType)) {
            return startsWith(fileBytes, OLE2_MAGIC);
        }

        return false;
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    /**
     * 이미지 썸네일 생성 (JPEG 70%)
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

    /** 이미지 압축 결과. changed=false면 원본을 그대로 쓰라는 뜻. */
    public record ProcessedImage(byte[] bytes, String contentType, boolean changed) {}

    /**
     * 이미지를 최대 변 {@code maxDim}px로 축소하고 JPEG 품질 {@code quality}로 재인코딩한다.
     *
     * <p>안전 규칙:
     * <ul>
     *   <li>JPEG / 불투명 PNG → JPEG(품질 적용)로 압축 — 사진·스크린샷 절감 효과 큼</li>
     *   <li>투명도가 있는 PNG(스프라이트 등) → PNG(무손실) 유지 — JPEG로 바꾸면 투명 배경이 깨짐</li>
     *   <li>GIF·WebP 등 그 외 → 손대지 않음 — 애니메이션 프레임이 날아감</li>
     *   <li>디코드 실패·원본보다 커지는 경우 → 원본 유지</li>
     * </ul>
     *
     * @return 압축된 바이트/컨텐츠 타입. 압축이 이득 없거나 불가하면 {@code changed=false}로 원본을 담아 반환.
     */
    public static ProcessedImage compressImage(byte[] original, String contentType, int maxDim, double quality) {
        boolean isJpeg = "image/jpeg".equals(contentType);
        boolean isPng = "image/png".equals(contentType);
        if (!isJpeg && !isPng) {
            return new ProcessedImage(original, contentType, false);  // gif/webp 등은 원본 유지
        }
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(original));
            if (img == null) {
                return new ProcessedImage(original, contentType, false);  // 디코드 실패 → 원본
            }
            int longest = Math.max(img.getWidth(), img.getHeight());
            double scale = longest > maxDim ? (double) maxDim / longest : 1.0;
            boolean keepPng = isPng && hasTransparency(img);  // 투명 PNG는 JPEG 변환 금지

            ByteArrayOutputStream os = new ByteArrayOutputStream();
            Thumbnails.Builder<BufferedImage> b = Thumbnails.of(img).scale(scale);
            String outType;
            if (keepPng) {
                b.outputFormat("png");
                outType = "image/png";
            } else {
                b.outputFormat("jpg").outputQuality(quality);
                outType = "image/jpeg";
            }
            b.toOutputStream(os);
            byte[] out = os.toByteArray();

            // 리사이즈도 없는데 결과가 더 크면(이미 최적화된 작은 이미지) 원본 유지
            if (scale == 1.0 && out.length >= original.length) {
                return new ProcessedImage(original, contentType, false);
            }
            return new ProcessedImage(out, outType, true);
        } catch (IOException e) {
            return new ProcessedImage(original, contentType, false);  // 실패 시 원본
        }
    }

    /** 실제로 반투명/투명 픽셀이 하나라도 있는지 검사(불투명 ARGB는 JPEG 압축 대상으로 취급). */
    private static boolean hasTransparency(BufferedImage img) {
        if (!img.getColorModel().hasAlpha()) {
            return false;
        }
        int w = img.getWidth();
        int h = img.getHeight();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if ((img.getRGB(x, y) >>> 24) < 255) {
                    return true;
                }
            }
        }
        return false;
    }
}
