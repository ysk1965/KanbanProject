package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.global.service.FileUploadService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * soffice 를 가짜 셸 스크립트로 바꿔 끼워 변환 오케스트레이션(명령 구성·결과 업로드·상태 전이)을 검증한다.
 * 실제 LibreOffice 렌더링 품질은 여기서 다루지 않는다.
 */
@ExtendWith(MockitoExtension.class)
class DocumentPreviewServiceTest {

    @Mock StorageFileRepository fileRepository;
    @Mock FileUploadService fileUploadService;

    @TempDir Path tempDir;

    DocumentPreviewService service;

    @BeforeEach
    void setUp() {
        service = new DocumentPreviewService(fileRepository, fileUploadService);
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "timeoutSeconds", 10L);
        ReflectionTestUtils.setField(service, "maxSourceBytes", 50L * 1024 * 1024);
        ReflectionTestUtils.setField(service, "workDirBase", tempDir.resolve("work").toString());
    }

    @Test
    void cleanupOrphanedWorkDirs_removesOnlyDocpreviewDirs() throws Exception {
        Path base = tempDir.resolve("work");
        Files.createDirectories(base.resolve("docpreview-123").resolve("out"));
        Files.writeString(base.resolve("docpreview-123").resolve("source.pptx"), "x");
        Files.createDirectories(base.resolve("other"));

        service.cleanupOrphanedWorkDirs();

        assertFalse(Files.exists(base.resolve("docpreview-123")), "죽은 변환의 작업 디렉터리는 제거");
        assertTrue(Files.exists(base.resolve("other")), "다른 디렉터리는 손대지 않음");
    }

    private Path fakeSoffice(String body) throws Exception {
        Path script = tempDir.resolve("soffice");
        Files.writeString(script, "#!/bin/sh\n" + body + "\n");
        Files.setPosixFilePermissions(script, PosixFilePermissions.fromString("rwxr-xr-x"));
        ReflectionTestUtils.setField(service, "sofficePath", script.toString());
        return script;
    }

    private StorageFile docFile(String name, String key) {
        return StorageFile.builder()
                .id("f1")
                .originalFilename(name)
                .s3Key(key)
                .contentType("application/octet-stream")
                .fileSize(1234L)
                .build();
    }

    @Test
    void isConvertible_officeAndHwpOnly() {
        assertTrue(DocumentPreviewService.isConvertible("보고서.docx"));
        assertTrue(DocumentPreviewService.isConvertible("deck.PPTX"));
        assertTrue(DocumentPreviewService.isConvertible("계약서.hwp"));
        assertTrue(DocumentPreviewService.isConvertible("x.hwpx"));
        assertFalse(DocumentPreviewService.isConvertible("data.xlsx"));   // 프론트 SheetJS 담당
        assertFalse(DocumentPreviewService.isConvertible("a.pdf"));
        assertFalse(DocumentPreviewService.isConvertible("noext"));
        assertFalse(DocumentPreviewService.isConvertible(null));
    }

    @Test
    void previewKey_replacesExtensionKeepingDirectory() {
        assertEquals("storage/board/abc/uuid_preview.pdf",
                DocumentPreviewService.previewKeyFor("storage/board/abc/uuid.docx"));
        assertEquals("storage/x/noext_preview.pdf",
                DocumentPreviewService.previewKeyFor("storage/x/noext"));
    }

    @Test
    void canConvert_falseWhenSofficeMissing() {
        ReflectionTestUtils.setField(service, "sofficePath", tempDir.resolve("missing").toString());
        assertFalse(service.canConvert(docFile("a.docx", "storage/u/a.docx")));
        assertFalse(service.isAvailable());
    }

    @Test
    void convertAsync_success_uploadsPdfAndMarksReady() throws Exception {
        // --outdir 다음 인자에 source.pdf 를 써 주는 가짜 soffice. 원본 내용을 그대로 PDF 인 척 복사한다.
        fakeSoffice("""
                out=""
                src=""
                while [ $# -gt 0 ]; do
                  if [ "$1" = "--outdir" ]; then shift; out="$1"; fi
                  src="$1"; shift
                done
                cp "$src" "$out/source.pdf"
                exit 0
                """);
        StorageFile file = docFile("보고서.docx", "storage/u/uuid.docx");
        when(fileRepository.findById("f1")).thenReturn(Optional.of(file));
        when(fileUploadService.getAsStream("storage/u/uuid.docx"))
                .thenReturn(new ByteArrayInputStream("DOCX-BYTES".getBytes(StandardCharsets.UTF_8)));

        service.convertAsync("f1");

        verify(fileUploadService).uploadDirect(
                argThat((byte[] b) -> "DOCX-BYTES".equals(new String(b, StandardCharsets.UTF_8))),
                eq("storage/u/uuid_preview.pdf"), eq("application/pdf"));
        assertEquals(StorageFile.PreviewStatus.READY, file.getPreviewStatus());
        assertEquals("storage/u/uuid_preview.pdf", file.getPreviewKey());
        verify(fileRepository).save(file);
    }

    @Test
    void convertAsync_nonZeroExit_marksFailedWithoutUpload() throws Exception {
        fakeSoffice("echo 'Error: source file could not be loaded' ; exit 1");
        StorageFile file = docFile("깨진.hwp", "storage/u/uuid.hwp");
        when(fileRepository.findById("f1")).thenReturn(Optional.of(file));
        when(fileUploadService.getAsStream(anyString()))
                .thenReturn(new ByteArrayInputStream(new byte[]{1, 2, 3}));

        service.convertAsync("f1");

        verify(fileUploadService, never()).uploadDirect(any(byte[].class), anyString(), anyString());
        assertEquals(StorageFile.PreviewStatus.FAILED, file.getPreviewStatus());
        assertNull(file.getPreviewKey());
        verify(fileRepository).save(file);
    }

    @Test
    void convertAsync_timeout_marksFailed() throws Exception {
        ReflectionTestUtils.setField(service, "timeoutSeconds", 1L);
        fakeSoffice("sleep 5; exit 0");
        StorageFile file = docFile("slow.pptx", "storage/u/uuid.pptx");
        when(fileRepository.findById("f1")).thenReturn(Optional.of(file));
        when(fileUploadService.getAsStream(anyString()))
                .thenReturn(new ByteArrayInputStream(new byte[]{1}));

        long start = System.currentTimeMillis();
        service.convertAsync("f1");

        assertTrue(System.currentTimeMillis() - start < 4000, "should give up at timeout, not wait for sleep");
        assertEquals(StorageFile.PreviewStatus.FAILED, file.getPreviewStatus());
        verify(fileUploadService, never()).uploadDirect(any(byte[].class), anyString(), anyString());
    }

    @Test
    void convertAsync_deletedOrMissingFile_isNoop() {
        when(fileRepository.findById("f1")).thenReturn(Optional.empty());
        service.convertAsync("f1");
        verifyNoInteractions(fileUploadService);
        verify(fileRepository, never()).save(any());
    }

    // ==================== Stale PENDING recovery ====================

    @Test
    void isStalePending_onlyWhenPendingAndOlderThanThreshold() {
        // timeoutSeconds=10 → stale 기준 50초
        StorageFile fresh = docFile("a.pptx", "s/a.pptx");
        fresh.markPreviewPending();
        assertFalse(service.isStalePending(fresh), "방금 큐잉한 파일은 고아가 아니다");

        StorageFile old = docFile("b.pptx", "s/b.pptx");
        old.markPreviewPending();
        ReflectionTestUtils.setField(old, "previewRequestedAt",
                java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).minusSeconds(120));
        assertTrue(service.isStalePending(old), "기준보다 오래 PENDING 이면 고아");

        StorageFile legacy = docFile("c.pptx", "s/c.pptx");
        ReflectionTestUtils.setField(legacy, "previewStatus", StorageFile.PreviewStatus.PENDING);
        assertTrue(service.isStalePending(legacy), "요청 시각이 없는 옛 PENDING 도 고아");

        StorageFile ready = docFile("d.pptx", "s/d.pptx");
        ready.markPreviewReady("s/d_preview.pdf");
        assertFalse(service.isStalePending(ready));
    }

    @Test
    void resetStalePending_resetsToNone_butSkipsInFlight() throws Exception {
        StorageFile orphan = docFile("a.pptx", "s/a.pptx");
        orphan.markPreviewPending();
        StorageFile mine = StorageFile.builder().id("f2").originalFilename("b.pptx").s3Key("s/b.pptx")
                .fileSize(10).build();
        mine.markPreviewPending();
        when(fileRepository.findStalePreviewPending(any())).thenReturn(java.util.List.of(orphan, mine));

        // f2 는 이 인스턴스가 처리 중인 것으로 등록
        @SuppressWarnings("unchecked")
        java.util.Set<String> inFlight = (java.util.Set<String>) ReflectionTestUtils.getField(service, "inFlight");
        inFlight.add("f2");

        int n = service.resetStalePending(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC));

        assertEquals(1, n);
        assertEquals(StorageFile.PreviewStatus.NONE, orphan.getPreviewStatus());
        assertNull(orphan.getPreviewRequestedAt());
        assertEquals(StorageFile.PreviewStatus.PENDING, mine.getPreviewStatus());
        verify(fileRepository, times(1)).save(orphan);
        verify(fileRepository, never()).save(mine);
    }

    @Test
    void elapsedAndQueueAhead_useRequestedAt() {
        StorageFile file = docFile("a.pptx", "s/a.pptx");
        assertEquals(0, service.elapsedSeconds(file));
        assertEquals(0, service.queueAhead(file));
        verify(fileRepository, never()).countPreviewQueuedBefore(any());

        file.markPreviewPending();
        ReflectionTestUtils.setField(file, "previewRequestedAt",
                java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).minusSeconds(42));
        when(fileRepository.countPreviewQueuedBefore(any())).thenReturn(3L);

        assertTrue(service.elapsedSeconds(file) >= 42);
        assertEquals(3, service.queueAhead(file));
    }
}
