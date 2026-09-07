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
}
