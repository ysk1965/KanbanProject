package com.kanban.global.scheduler;

import com.kanban.global.service.FileUploadService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 만료된 임시 업로드 파일 정리 (30분마다 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TempFileCleanupScheduler {

    private final FileUploadService fileUploadService;

    @Value("${spring.servlet.multipart.location:/var/tmp/spring-multipart}")
    private String multipartLocation;

    @PostConstruct
    public void ensureMultipartDir() {
        try {
            Files.createDirectories(Path.of(multipartLocation));
            log.info("Multipart temp directory ready: {}", multipartLocation);
        } catch (IOException e) {
            log.warn("Failed to create multipart temp directory: {}", multipartLocation, e);
        }
    }

    @Scheduled(fixedRate = 1800000) // 30분
    public void cleanup() {
        log.debug("Running temp file cleanup...");
        fileUploadService.cleanupExpiredTemp();
        cleanupMultipartTemp();
    }

    private void cleanupMultipartTemp() {
        Path dir = Path.of(multipartLocation);
        if (!Files.isDirectory(dir)) return;

        Instant cutoff = Instant.now().minus(30, ChronoUnit.MINUTES);
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.lastModifiedTime().toInstant().isBefore(cutoff)) {
                        try {
                            Files.deleteIfExists(file);
                        } catch (IOException ignored) {}
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("Failed to cleanup multipart temp files", e);
        }
    }
}
