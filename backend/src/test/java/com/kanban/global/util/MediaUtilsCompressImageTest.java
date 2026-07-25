package com.kanban.global.util;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.*;

/** MediaUtils.compressImage 동작 검증 */
class MediaUtilsCompressImageTest {

    private byte[] encode(BufferedImage img, String format) throws Exception {
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        ImageIO.write(img, format, os);
        return os.toByteArray();
    }

    private BufferedImage decode(byte[] bytes) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    @Test
    void 큰_불투명_PNG는_JPEG로_1600px내로_압축된다() throws Exception {
        // 2400x1500 불투명 사진풍 PNG (부드러운 2D 그라디언트 = JPEG가 잘 압축하는 형태)
        BufferedImage img = new BufferedImage(2400, 1500, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 1500; y++) {
            for (int x = 0; x < 2400; x++) {
                int r = (x * 255) / 2400;
                int gc = (y * 255) / 1500;
                int b = ((x + y) * 255) / 3900;
                img.setRGB(x, y, (r << 16) | (gc << 8) | b);
            }
        }
        byte[] original = encode(img, "png");

        MediaUtils.ProcessedImage r = MediaUtils.compressImage(original, "image/png", 1600, 0.8);

        assertTrue(r.changed(), "압축되어야 함");
        assertEquals("image/jpeg", r.contentType(), "불투명 PNG는 JPEG로 변환");
        assertTrue(r.bytes().length < original.length, "결과가 원본보다 작아야 함");
        BufferedImage out = decode(r.bytes());
        int longest = Math.max(out.getWidth(), out.getHeight());
        assertTrue(longest <= 1600 && longest >= 1590, "긴 변이 1600 근방으로 축소 (실제=" + longest + ")");
    }

    @Test
    void 투명_PNG는_PNG로_유지되어_투명도가_보존된다() throws Exception {
        // 반투명 픽셀이 있는 스프라이트 가정
        BufferedImage img = new BufferedImage(300, 300, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 300; y++) {
            for (int x = 0; x < 300; x++) {
                int alpha = (x < 150) ? 0 : 255;   // 왼쪽 절반 완전 투명
                img.setRGB(x, y, (alpha << 24) | 0x3366CC);
            }
        }
        byte[] original = encode(img, "png");

        MediaUtils.ProcessedImage r = MediaUtils.compressImage(original, "image/png", 1600, 0.8);

        assertEquals("image/png", r.contentType(), "투명 PNG는 PNG 유지");
        BufferedImage out = decode(r.bytes());
        assertTrue(out.getColorModel().hasAlpha(), "알파 채널 유지");
        // 왼쪽 투명 픽셀이 여전히 투명한지
        assertEquals(0, out.getRGB(10, 10) >>> 24, "투명도 보존");
    }

    @Test
    void GIF는_손대지_않고_원본_유지() throws Exception {
        BufferedImage img = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        byte[] original = encode(img, "gif");

        MediaUtils.ProcessedImage r = MediaUtils.compressImage(original, "image/gif", 1600, 0.8);

        assertFalse(r.changed(), "GIF는 변경 없음");
        assertSame(original, r.bytes(), "원본 바이트 그대로");
        assertEquals("image/gif", r.contentType());
    }

    @Test
    void 큰_JPEG는_1600px_내로_재인코딩된다() throws Exception {
        BufferedImage img = new BufferedImage(3000, 1000, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 1000; y++) {
            for (int x = 0; x < 3000; x++) {
                int r = (x * 255) / 3000;
                int gc = (y * 255) / 1000;
                int b = ((x + y) * 255) / 4000;
                img.setRGB(x, y, (r << 16) | (gc << 8) | b);
            }
        }
        byte[] original = encode(img, "jpg");

        MediaUtils.ProcessedImage r = MediaUtils.compressImage(original, "image/jpeg", 1600, 0.8);

        assertTrue(r.changed());
        assertEquals("image/jpeg", r.contentType());
        BufferedImage out = decode(r.bytes());
        int longest = Math.max(out.getWidth(), out.getHeight());
        assertTrue(longest <= 1600 && longest >= 1590, "3000 -> 1600 근방 (실제=" + longest + ")");
    }

    @Test
    void 손상된_바이트는_원본을_그대로_돌려준다() {
        byte[] garbage = new byte[]{1, 2, 3, 4, 5};
        MediaUtils.ProcessedImage r = MediaUtils.compressImage(garbage, "image/png", 1600, 0.8);
        assertFalse(r.changed());
        assertSame(garbage, r.bytes());
    }
}
