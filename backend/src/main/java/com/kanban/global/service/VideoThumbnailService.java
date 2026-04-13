package com.kanban.global.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * FFmpeg를 이용한 영상 썸네일 추출 서비스
 * FFmpeg가 설치되지 않은 환경에서는 경고 로그 후 null 반환 (graceful degradation)
 */
@Slf4j
@Service
public class VideoThumbnailService {

    @Value("${app.file.video.ffmpeg-path:/usr/bin/ffmpeg}")
    private String ffmpegPath;

    /**
     * 영상에서 1초 시점의 프레임을 JPEG 썸네일로 추출
     *
     * @param videoBytes 영상 파일 바이트 배열
     * @param extension  파일 확장자 (.mp4, .webm, .mov)
     * @param maxWidth   최대 너비
     * @param maxHeight  최대 높이
     * @return 썸네일 JPEG 바이트 배열, 실패 시 null
     */
    public byte[] extractThumbnail(byte[] videoBytes, String extension, int maxWidth, int maxHeight) {
        Path tempVideo = null;
        Path tempThumbnail = null;

        try {
            // 임시 영상 파일 저장
            tempVideo = Files.createTempFile("video_" + UUID.randomUUID(), extension);
            Files.write(tempVideo, videoBytes);

            // 임시 썸네일 출력 경로
            tempThumbnail = Files.createTempFile("thumb_" + UUID.randomUUID(), ".jpg");

            // FFmpeg 실행: 1초 시점에서 프레임 추출, 지정 크기로 리사이즈
            String scaleFilter = String.format("scale='min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease", maxWidth, maxHeight);
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpegPath,
                    "-i", tempVideo.toString(),
                    "-ss", "1",              // 1초 시점
                    "-vframes", "1",         // 1프레임만
                    "-vf", scaleFilter,
                    "-q:v", "2",             // JPEG 품질 (2=고품질)
                    "-y",                    // 덮어쓰기
                    tempThumbnail.toString()
            );
            pb.redirectErrorStream(true);

            Process process = pb.start();
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                log.warn("FFmpeg exited with code {} for video thumbnail extraction", exitCode);
                return null;
            }

            byte[] thumbnailBytes = Files.readAllBytes(tempThumbnail);
            if (thumbnailBytes.length == 0) {
                log.warn("FFmpeg produced empty thumbnail");
                return null;
            }

            log.info("Video thumbnail extracted successfully ({} bytes)", thumbnailBytes.length);
            return thumbnailBytes;

        } catch (IOException | InterruptedException e) {
            log.warn("Failed to extract video thumbnail: {}", e.getMessage());
            return null;
        } finally {
            // 임시 파일 정리
            deleteTempFile(tempVideo);
            deleteTempFile(tempThumbnail);
        }
    }

    private void deleteTempFile(Path path) {
        if (path != null) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                log.warn("Failed to delete temp file: {}", path);
            }
        }
    }
}
