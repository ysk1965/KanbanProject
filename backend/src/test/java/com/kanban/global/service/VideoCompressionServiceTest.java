package com.kanban.global.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * VideoCompressionService 검증. 로컬/CI에 ffmpeg가 있을 때만 실행된다(없으면 skip).
 */
@EnabledIf("hasFfmpeg")
class VideoCompressionServiceTest {

    private VideoCompressionService service;

    /** @EnabledIf 조건: PATH에 ffmpeg가 있는가 */
    static boolean hasFfmpeg() {
        return resolveFfmpeg() != null;
    }

    private static String resolveFfmpeg() {
        for (String p : new String[]{"/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"}) {
            if (Files.isExecutable(Path.of(p))) {
                return p;
            }
        }
        return null;
    }

    @BeforeEach
    void setUp() {
        service = new VideoCompressionService();
        ReflectionTestUtils.setField(service, "ffmpegPath", resolveFfmpeg());
        ReflectionTestUtils.setField(service, "timeoutSeconds", 120L);
        ReflectionTestUtils.setField(service, "maxDimension", 1280);
        ReflectionTestUtils.setField(service, "crf", 28);
    }

    /** ffmpeg로 고해상도(1920x1080) 5초 테스트 영상을 생성해 원본으로 쓴다. */
    private byte[] makeSourceVideo() throws Exception {
        Path out = Files.createTempFile("src_" + UUID.randomUUID(), ".mp4");
        try {
            Process p = new ProcessBuilder(
                    resolveFfmpeg(),
                    "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=5",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
                    "-pix_fmt", "yuv420p", "-y", out.toString()
            ).redirectErrorStream(true).start();
            // stderr 비우기
            try (var is = p.getInputStream()) { is.readAllBytes(); }
            assertEquals(0, p.waitFor(), "테스트 영상 생성 실패");
            return Files.readAllBytes(out);
        } finally {
            Files.deleteIfExists(out);
        }
    }

    @Test
    void 고해상도_영상을_720p로_압축해_용량을_줄인다() throws Exception {
        byte[] original = makeSourceVideo();
        assertTrue(original.length > 0);

        byte[] compressed = service.compress(original, ".mp4");

        assertNotNull(compressed, "압축 결과가 있어야 함");
        assertTrue(compressed.length < original.length,
                "압축본이 더 작아야 함 (원본=" + original.length + ", 결과=" + compressed.length + ")");
        // 유효한 MP4인지 (ftyp 박스: bytes 4-7)
        assertTrue(compressed.length > 12
                && compressed[4] == 0x66 && compressed[5] == 0x74
                && compressed[6] == 0x79 && compressed[7] == 0x70, "유효한 MP4 헤더");
    }

    @Test
    void ffmpeg_경로가_틀리면_null을_반환하고_원본을_유지한다() throws Exception {
        ReflectionTestUtils.setField(service, "ffmpegPath", "/nonexistent/ffmpeg");
        byte[] original = makeSourceVideo();

        byte[] result = service.compress(original, ".mp4");

        assertNull(result, "미설치/오류 시 null → 호출부가 원본 사용");
    }

    @Test
    void 빈_바이트는_null() {
        assertNull(service.compress(new byte[0], ".mp4"));
        assertNull(service.compress(null, ".mp4"));
    }
}
