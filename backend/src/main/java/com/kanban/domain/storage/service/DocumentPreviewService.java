package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
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

    @Value("${app.storage.preview.timeout-seconds:300}")
    private long timeoutSeconds;

    /** 이보다 큰 원본은 변환하지 않는다 (메모리·시간 보호) */
    @Value("${app.storage.preview.max-source-bytes:209715200}")
    private long maxSourceBytes;

    /**
     * 이 시간 넘게 PENDING 이면 워커가 사라진 고아로 보고 NONE 으로 되돌린다.
     * 정상 경로의 최대 소요(슬롯 대기 timeout×3 + 변환 timeout)보다 넉넉히 길게 잡는다. 0 이하면 timeout×5.
     */
    @Value("${app.storage.preview.stale-seconds:0}")
    private long staleSecondsConfig;

    /** soffice 는 메모리를 많이 먹어서 동시 실행을 1개로 묶는다 */
    private final Semaphore conversionSlot = new Semaphore(1);

    /**
     * 이 인스턴스의 실행기 큐에 들어갔거나 변환 중인 파일 id. 고아 PENDING 복구 때 아직 살아 있는 작업을
     * 되돌리지 않기 위한 로컬 장부라서 다른 인스턴스의 작업은 모른다(그쪽은 시간 기준으로만 판단).
     */
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();

    private volatile Boolean availableCache;

    /** @Async 는 프록시를 거쳐야 실행기로 가므로 자기 자신을 프록시로 들고 있는다. */
    private DocumentPreviewService self;

    public DocumentPreviewService(StorageFileRepository fileRepository,
                                  @Lazy FileUploadService fileUploadService) {
        this.fileRepository = fileRepository;
        this.fileUploadService = fileUploadService;
    }

    @Autowired
    public void setSelf(@Lazy DocumentPreviewService self) {
        this.self = self;
    }

    public static boolean isConvertible(String filename) {
        if (filename == null) return false;
        String ext = MediaUtils.getExtension(filename).replace(".", "").toLowerCase(Locale.ROOT);
        return CONVERTIBLE_EXTENSIONS.contains(ext);
    }

    public boolean canConvert(StorageFile file) {
        return enabled && isConvertible(file.getOriginalFilename())
                && !isTooLarge(file) && isAvailable();
    }

    /**
     * 형식·서버는 지원하지만 원본이 상한을 넘어 변환하지 않는 경우.
     * 호출자는 UNAVAILABLE(서버 미지원) 과 구분해 TOO_LARGE 로 응답한다.
     */
    public boolean isTooLarge(StorageFile file) {
        return file.getFileSize() > maxSourceBytes;
    }

    public long getMaxSourceBytes() {
        return maxSourceBytes;
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

    // ==================== Queue bookkeeping ====================

    private long staleSeconds() {
        return staleSecondsConfig > 0 ? staleSecondsConfig : timeoutSeconds * 5;
    }

    /**
     * 변환 큐에 넣는다. 호출 측은 먼저 PENDING 으로 저장하고 커밋 후에 부른다.
     * 실행기 큐(50개)가 꽉 차 거부되면 PENDING 에 영원히 남지 않도록 NONE 으로 되돌린다 — 다음 조회 때 재시도된다.
     */
    public void enqueue(String fileId) {
        inFlight.add(fileId);
        try {
            self.convertAsync(fileId);
        } catch (RuntimeException e) {
            inFlight.remove(fileId);
            log.warn("Document preview queue rejected: fileId={}, error={}", fileId, e.getMessage());
            fileRepository.findById(fileId).ifPresent(f -> {
                f.resetPreviewToNone();
                fileRepository.save(f);
            });
        }
    }

    /**
     * PENDING 인데 이 인스턴스의 큐에 없고 요청 시각이 stale 기준을 넘긴 파일.
     * 서버 재시작으로 워커가 날아갔거나 실행기 큐에서 유실된 경우라 재큐잉해야 한다.
     */
    public boolean isStalePending(StorageFile file) {
        if (file.getPreviewStatus() != StorageFile.PreviewStatus.PENDING) return false;
        if (inFlight.contains(file.getId())) return false;
        LocalDateTime requestedAt = file.getPreviewRequestedAt();
        if (requestedAt == null) return true;
        return requestedAt.plusSeconds(staleSeconds()).isBefore(LocalDateTime.now(ZoneOffset.UTC));
    }

    /** PENDING 으로 바뀐 뒤 흐른 시간(초). 요청 시각이 없으면 0. */
    public long elapsedSeconds(StorageFile file) {
        LocalDateTime requestedAt = file.getPreviewRequestedAt();
        if (requestedAt == null) return 0;
        return Math.max(0, Duration.between(requestedAt, LocalDateTime.now(ZoneOffset.UTC)).getSeconds());
    }

    /** 변환 대기열에서 이 파일 앞에 있는 개수. 워커가 전역 1개라 모든 스코프의 PENDING 을 센다. */
    public long queueAhead(StorageFile file) {
        LocalDateTime requestedAt = file.getPreviewRequestedAt();
        if (requestedAt == null) return 0;
        return fileRepository.countPreviewQueuedBefore(requestedAt);
    }

    /**
     * 서버 기동 직후: 이전 프로세스가 큐잉했던 PENDING 은 전부 고아다(비동기 작업은 프로세스와 함께 사라진다).
     * 롤링 배포로 옛 인스턴스가 아직 변환 중인 파일도 같이 되돌아가지만, 그쪽이 끝나면 READY 로 덮어쓰므로
     * 최악의 경우 한 번 더 변환될 뿐 데이터는 깨지지 않는다.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void resetOrphanedPendingOnStartup() {
        if (!enabled) return;
        int n = resetStalePending(LocalDateTime.now(ZoneOffset.UTC));
        if (n > 0) log.info("Document preview: reset {} orphaned PENDING file(s) on startup", n);
    }

    /** 주기 점검: stale 기준을 넘긴 PENDING 을 NONE 으로 되돌려 다음 조회 때 재시도되게 한다. */
    @Scheduled(fixedDelayString = "${app.storage.preview.stale-sweep-ms:600000}",
               initialDelayString = "${app.storage.preview.stale-sweep-ms:600000}")
    public void sweepStalePending() {
        if (!enabled) return;
        int n = resetStalePending(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(staleSeconds()));
        if (n > 0) log.info("Document preview: reset {} stale PENDING file(s)", n);
    }

    /** cutoff 이전에 요청된 PENDING 중 이 인스턴스가 처리 중이 아닌 것을 NONE 으로. 되돌린 개수를 돌려준다. */
    int resetStalePending(LocalDateTime cutoff) {
        List<StorageFile> stale = fileRepository.findStalePreviewPending(cutoff);
        int n = 0;
        for (StorageFile f : stale) {
            if (inFlight.contains(f.getId())) continue;
            f.resetPreviewToNone();
            fileRepository.save(f);
            n++;
        }
        return n;
    }

    // ==================== Conversion ====================

    /**
     * 비동기 변환. 직접 부르지 말고 {@link #enqueue(String)} 를 쓴다(프록시·장부 처리).
     * 어떤 경우에도 예외를 밖으로 내지 않고 상태(READY/FAILED)로 남긴다.
     */
    @Async("documentPreviewExecutor")
    public void convertAsync(String fileId) {
        try {
            doConvert(fileId);
        } finally {
            inFlight.remove(fileId);
        }
    }

    private void doConvert(String fileId) {
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
