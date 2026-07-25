package com.kanban.global.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * FFmpeg로 영상을 재인코딩해 용량을 줄이는 서비스.
 *
 * <p>{@link VideoThumbnailService}와 같은 방식(ProcessBuilder + graceful degradation)을 따른다.
 * FFmpeg가 없거나 실패하거나 결과가 원본보다 크면 {@code null}을 반환하고, 호출부는 원본을 쓴다.
 *
 * <p>기본 프리셋: 긴 변 1280px(720p급)로 축소, H.264 CRF 28, AAC 128k, faststart.
 * 무손실이 아니라 화질이 약간 떨어지지만, 슬랙에 올라온 화면녹화(수십~수백 MB)를
 * 보고서용으로 크게 줄이는 데 목적이 있다.
 */
@Slf4j
@Service
public class VideoCompressionService {

    @Value("${app.file.video.ffmpeg-path:/usr/bin/ffmpeg}")
    private String ffmpegPath;

    /** 재인코딩이 이 시간을 넘기면 프로세스를 죽이고 원본을 쓴다(보고서 생성 스레드 무한 대기 방지). */
    @Value("${app.file.video.compress-timeout-seconds:600}")
    private long timeoutSeconds;

    /** 축소 목표 최대 변(px). 원본이 더 작으면 확대하지 않는다. */
    @Value("${app.file.video.compress-max-dimension:1280}")
    private int maxDimension;

    /** H.264 CRF(작을수록 고화질/큰 용량). 23=기본, 28=보고서용 절충. */
    @Value("${app.file.video.compress-crf:28}")
    private int crf;

    /**
     * 영상을 재인코딩해 더 작은 MP4 바이트를 돌려준다.
     *
     * @param videoBytes 원본 영상 바이트
     * @param extension  원본 확장자(예: {@code .mp4}, {@code .mov}, {@code .webm}) — ffmpeg 디먹서 힌트
     * @return 압축된 MP4 바이트. FFmpeg 미설치·실패·결과가 원본 이상이면 {@code null}(원본 유지).
     */
    public byte[] compress(byte[] videoBytes, String extension) {
        if (videoBytes == null || videoBytes.length == 0) {
            return null;
        }
        Path tempInput = null;
        Path tempOutput = null;
        Process process = null;
        try {
            String ext = (extension != null && extension.startsWith(".")) ? extension : ".mp4";
            tempInput = Files.createTempFile("vidc_in_" + UUID.randomUUID(), ext);
            Files.write(tempInput, videoBytes);
            tempOutput = Files.createTempFile("vidc_out_" + UUID.randomUUID(), ".mp4");

            // 긴 변을 maxDimension 이하로만 축소(확대 없음), 짝수 픽셀 보정(H.264 요구)
            String scaleFilter = String.format(
                    "scale='if(gt(iw,ih),min(%d,iw),-2)':'if(gt(iw,ih),-2,min(%d,ih))'",
                    maxDimension, maxDimension);

            ProcessBuilder pb = new ProcessBuilder(
                    ffmpegPath,
                    "-i", tempInput.toString(),
                    "-vf", scaleFilter,
                    "-c:v", "libx264",
                    "-crf", String.valueOf(crf),
                    "-preset", "veryfast",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    "-movflags", "+faststart",
                    "-y",
                    tempOutput.toString()
            );
            pb.redirectErrorStream(true);
            process = pb.start();

            // stdout(=합쳐진 stderr)을 비워주지 않으면 파이프 버퍼가 차서 ffmpeg가 멈출 수 있다.
            drainQuietly(process);

            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                log.warn("영상 압축 타임아웃({}s) — 원본 사용", timeoutSeconds);
                process.destroyForcibly();
                return null;
            }
            if (process.exitValue() != 0) {
                log.warn("FFmpeg 영상 압축 실패(exit={}) — 원본 사용", process.exitValue());
                return null;
            }

            byte[] out = Files.readAllBytes(tempOutput);
            if (out.length == 0 || out.length >= videoBytes.length) {
                log.info("영상 압축 이득 없음(원본 {}B, 결과 {}B) — 원본 사용", videoBytes.length, out.length);
                return null;
            }
            log.info("영상 압축 완료: {}B → {}B ({}% 절감)",
                    videoBytes.length, out.length,
                    100 - (out.length * 100L / videoBytes.length));
            return out;

        } catch (IOException e) {
            // FFmpeg 미설치(파일 없음)도 여기로 — 경고 후 원본 유지
            log.warn("영상 압축 불가(FFmpeg 미설치/오류): {} — 원본 사용", e.getMessage());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (process != null) {
                process.destroyForcibly();
            }
            return null;
        } finally {
            deleteQuietly(tempInput);
            deleteQuietly(tempOutput);
        }
    }

    /** ffmpeg 진행 로그(합쳐진 stderr)를 백그라운드로 비워 파이프 블로킹을 막는다. */
    private void drainQuietly(Process process) {
        Thread t = new Thread(() -> {
            try (var is = process.getInputStream()) {
                byte[] buf = new byte[8192];
                while (is.read(buf) != -1) {
                    // 버리기만 한다
                }
            } catch (IOException ignored) {
                // 프로세스 종료 시 스트림이 닫히는 정상 경로
            }
        });
        t.setDaemon(true);
        t.start();
    }

    private void deleteQuietly(Path path) {
        if (path != null) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                log.warn("임시 파일 삭제 실패: {}", path);
            }
        }
    }
}
