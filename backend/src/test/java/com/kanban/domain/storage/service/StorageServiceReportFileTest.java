package com.kanban.domain.storage.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.storage.StorageScope;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.service.AsyncThumbnailService;
import com.kanban.global.service.FileUploadService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * StorageService의 보고서 파일 통합 로직 검증:
 *  - registerReportFile (멱등·quota 미강제·보드소유자 createdBy)
 *  - hardDeleteFile 가드 (reports/ 프리픽스 S3 객체 보호)
 */
@ExtendWith(MockitoExtension.class)
class StorageServiceReportFileTest {

    @Mock StorageFolderRepository folderRepository;
    @Mock StorageFileRepository fileRepository;
    @Mock UserRepository userRepository;
    @Mock FileUploadService fileUploadService;
    @Mock AsyncThumbnailService asyncThumbnailService;
    @Mock StorageQuotaService quotaService;
    @Mock StoragePermissionService permissionService;
    @Mock BoardRepository boardRepository;

    @InjectMocks StorageService service;

    // ===== registerReportFile =====

    @Test
    void 이미_등록된_파일이면_저장하지_않는다() {
        when(fileRepository.findByBoardIdAndS3Key("b1", "reports/slack/c/f.jpg"))
                .thenReturn(Optional.of(mock(StorageFile.class)));

        service.registerReportFile("b1", "reports/slack/c/f.jpg", "f.jpg", "image/jpeg", 100);

        verify(fileRepository, never()).save(any());
        verifyNoInteractions(quotaService);   // quota 미강제
    }

    @Test
    void 보드를_못찾으면_건너뛴다() {
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.empty());
        when(boardRepository.findById("b1")).thenReturn(Optional.empty());

        service.registerReportFile("b1", "reports/slack/c/f.jpg", "f.jpg", "image/jpeg", 100);

        verify(fileRepository, never()).save(any());
    }

    @Test
    void 신규_파일은_보드소유자를_createdBy로_저장하고_quota를_강제하지_않는다() {
        User owner = mock(User.class);
        Board board = mock(Board.class);
        when(board.getOwner()).thenReturn(owner);
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.empty());
        when(boardRepository.findById("b1")).thenReturn(Optional.of(board));

        service.registerReportFile("b1", "reports/slack/c/f.mp4", "clip.mp4", "video/mp4", 2048);

        ArgumentCaptor<StorageFile> cap = ArgumentCaptor.forClass(StorageFile.class);
        verify(fileRepository).save(cap.capture());
        StorageFile saved = cap.getValue();
        assertEquals("b1", saved.getBoardId());
        assertEquals("reports/slack/c/f.mp4", saved.getS3Key());
        assertEquals("clip.mp4", saved.getOriginalFilename());
        assertEquals("video/mp4", saved.getContentType());
        assertEquals(2048L, saved.getFileSize());
        assertSame(owner, saved.getCreatedBy());
        assertNull(saved.getOwner(), "보드 스코프라 개인 owner는 null");
        verifyNoInteractions(quotaService);
    }

    @Test
    void 빈_파일명이면_기본_이름을_쓴다() {
        User owner = mock(User.class);
        Board board = mock(Board.class);
        when(board.getOwner()).thenReturn(owner);
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.empty());
        when(boardRepository.findById("b1")).thenReturn(Optional.of(board));

        service.registerReportFile("b1", "reports/slack/c/x.jpg", "  ", "image/jpeg", 10);

        ArgumentCaptor<StorageFile> cap = ArgumentCaptor.forClass(StorageFile.class);
        verify(fileRepository).save(cap.capture());
        assertEquals("report-file", cap.getValue().getOriginalFilename());
    }

    @Test
    void null_인자는_무시() {
        service.registerReportFile(null, "k", "n", "image/jpeg", 1);
        service.registerReportFile("b", null, "n", "image/jpeg", 1);
        verify(fileRepository, never()).save(any());
        verifyNoInteractions(boardRepository);
    }

    // ===== hardDeleteFile 가드 (permanentDeleteFile 경유) =====

    @Test
    void 보고서_파일은_영구삭제해도_S3객체를_지우지_않는다() {
        StorageFile f = StorageFile.builder().s3Key("reports/slack/c/f.jpg").originalFilename("f").build();
        when(fileRepository.findByIdAndScope(eq("fid"), any(), any())).thenReturn(Optional.of(f));

        service.permanentDeleteFile(StorageScope.board("b1"), "u1", "fid");

        verify(fileUploadService, never()).delete(anyString());   // S3 객체 보존
        verify(fileRepository).delete(f);                          // DB row는 삭제
    }

    @Test
    void 일반_파일은_영구삭제시_S3객체도_지운다() {
        StorageFile f = StorageFile.builder().s3Key("storage/board/b1/uuid.jpg").originalFilename("f").build();
        when(fileRepository.findByIdAndScope(eq("fid"), any(), any())).thenReturn(Optional.of(f));

        service.permanentDeleteFile(StorageScope.board("b1"), "u1", "fid");

        verify(fileUploadService).delete("storage/board/b1/uuid.jpg");
        verify(fileRepository).delete(f);
    }
}
