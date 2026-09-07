package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 오피스 문서(docx/pptx/hwp 등)를 LibreOffice 헤드리스로 PDF 로 변환해 스토리지에 올린다.
 *
 * <ul>
 *   <li>브라우저가 네이티브로 열 수 없는 형식만 대상. xlsx/csv 는 프론트 SheetJS 뷰어가 맡는다.</li>
 *   <li>hwp/hwpx 는 LibreOffice 기본 필터가 3.x 만 읽으므로 EB 훅에서 H2Orestart 확장을 같이 설치한다.</li>
 *   <li>t3.small(2GB) 에서 JVM 과 soffice 가 공존해야 하므로 변환은 한 번에 하나만 돌린다.</li>
 *   <li>soffice 가 없으면 {@link #isAvailable()} 이 false 를 돌려주고 호출자는 UNAVAILABLE 로 응답한다.</li>
 * </ul>
 */
@Slf4j
@Service
public class DocumentPreviewService {

    /** 변환 대상 확장자 (점 없음, 소문자) */
    private static final Set<String> CONVERTIBLE_EXTENSIONS = Set.of(
            "doc", "docx", "ppt", "pptx", "hwp", "hwpx", "odt", "odp", "rtf");

    private final StorageFileRepository fileRepository;
    private final FileUploadService fileUploadService;

    @Value("${app.storage.preview.enabled:true}")
    private boolean enabled;

    @Value("${app.storage.preview.soffice-path:/usr/bin/soffice}")
    private String sofficePath;

    @Value("${app.storage.preview.timeout-seconds:120}")
    private long timeoutSeconds;

    /** 이보다 큰 원본은 변환하지 않는다 (메모리·시간 보호) */
    @Value("${app.storage.preview.max-source-bytes:52428800}")
    private long maxSourceBytes;

    /** soffice 는 메모리를 많이 먹어서 동시 실행을 1개로 묶는다 */
    private final Semaphore conversionSlot = new Semaphore(1);

    private volatile Boolean availableCache;

    public DocumentPreviewService(StorageFileRepository fileRepository,
                                  @Lazy FileUploadService fileUploadService) {
        this.fileRepository = fileRepository;
        this.fileUploadService = fileUploadService;
    }

    public static boolean isConvertible(String filename) {
        if (filename == null) return false;
        String ext = MediaUtils.getExtension(filename).replace(".", "").toLowerCase(Locale.ROOT);
        return CONVERTIBLE_EXTENSIONS.contains(ext);
    }

    public boolean canConvert(StorageFile file) {
        return enabled && isConvertible(file.getOriginalFilename())
                && file.getFileSize() <= maxSourceBytes && isAvailable();
    }

    /** soffice 실행 파일 존재 여부. 배포 훅이 best-effort 라 없을 수 있어 매번 확인하지 않고 캐시한다. */
    public boolean isAvailable() {
        if (!enabled) return false;
        Boolean cached = availableCache;
        if (cached != null) return cached;
        boolean ok = Files.isExecutable(Path.of(sofficePath));
        if (!ok) {
            log.warn("LibreOffice not found at {} — document PDF preview disabled", sofficePath);
        }
        availableCache = ok;
        return ok;
    }

    public static String previewKeyFor(String sourceKey) {
        int dot = sourceKey.lastIndexOf('.');
        String base = dot > sourceKey.lastIndexOf('/') ? sourceKey.substring(0, dot) : sourceKey;
        return base + "_preview.pdf";
    }

    /**
     * 비동기 변환. 호출 측은 먼저 PENDING 으로 저장하고 커밋 후에 이 메서드를 부른다.
     * 어떤 경우에도 예외를 밖으로 내지 않고 상태(READY/FAILED)로 남긴다.
     */
    @Async("documentPreviewExecutor")
    public void convertAsync(String fileId) {
        StorageFile file = fileRepository.findById(fileId).orElse(null);
        if (file == null || Boolean.TRUE.equals(file.getIsDeleted())) {
            return;
        }
        String previewKey = previewKeyFor(file.getS3Key());
        boolean acquired = false;
        try {
            acquired = conversionSlot.tryAcquire(timeoutSeconds * 3, TimeUnit.SECONDS);
            if (!acquired) {
                log.warn("Document preview slot timeout: fileId={}", fileId);
                updateStatus(fileId, null);
                return;
            }
            byte[] pdf = convertToPdf(file);
            fileUploadService.uploadDirect(pdf, previewKey, "application/pdf");
            updateStatus(fileId, previewKey);
            log.info("Document preview ready: fileId={}, key={}, bytes={}", fileId, previewKey, pdf.length);
        } catch (Exception e) {
            log.warn("Document preview failed: fileId={}, name={}, error={}",
                    fileId, file.getOriginalFilename(), e.getMessage());
            updateStatus(fileId, null);
        } finally {
            if (acquired) conversionSlot.release();
        }
    }

    /** 같은 클래스 안의 @Transactional 은 프록시를 안 타므로 repository.save 로 커밋한다 */
    private void updateStatus(String fileId, String previewKey) {
        fileRepository.findById(fileId).ifPresent(f -> {
            if (previewKey != null) f.markPreviewReady(previewKey);
            else f.markPreviewFailed();
            fileRepository.save(f);
        });
    }

    private byte[] convertToPdf(StorageFile file) throws IOException, InterruptedException {
        Path workDir = Files.createTempDirectory("docpreview-");
        try {
            String ext = MediaUtils.getExtension(file.getOriginalFilename());
            Path source = workDir.resolve("source" + ext);
            try (InputStream in = fileUploadService.getAsStream(file.getS3Key())) {
                Files.copy(in, source);
            }
            Path outDir = workDir.resolve("out");
            Files.createDirectories(outDir);
            // 프로필 디렉터리를 작업별로 분리해야 기존 soffice 인스턴스와 락 충돌 없이 헤드리스로 돈다
            Path profile = workDir.resolve("profile");

            List<String> cmd = List.of(
                    sofficePath,
                    "-env:UserInstallation=" + profile.toUri(),
                    "--headless", "--norestore", "--nologo", "--nodefault",
                    "--convert-to", "pdf",
                    "--outdir", outDir.toString(),
                    source.toString());
            Process process = new ProcessBuilder(cmd)
                    .redirectErrorStream(true)
                    .redirectOutput(workDir.resolve("soffice.log").toFile())
                    .start();
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IOException("soffice timeout after " + timeoutSeconds + "s");
            }
            Path pdf = outDir.resolve("source.pdf");
            if (process.exitValue() != 0 || !Files.exists(pdf)) {
                String tail = readTail(workDir.resolve("soffice.log"));
                throw new IOException("soffice exit=" + process.exitValue() + " " + tail);
            }
            return Files.readAllBytes(pdf);
        } finally {
            deleteQuietly(workDir);
        }
    }

    private static String readTail(Path logFile) {
        try {
            List<String> lines = Files.readAllLines(logFile);
            return String.join(" | ", lines.subList(Math.max(0, lines.size() - 5), lines.size()));
        } catch (IOException e) {
            return "";
        }
    }

    private static void deleteQuietly(Path dir) {
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) {
        }
    }
}
