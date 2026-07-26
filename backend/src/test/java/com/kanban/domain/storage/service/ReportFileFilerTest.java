package com.kanban.domain.storage.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolder;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * 보고서 수집 파일의 폴더화 검증:
 *  - 옮길 파일이 없으면 폴더를 만들지 않는다 (빈 폴더 방지)
 *  - 이미 폴더에 들어간 파일은 건드리지 않는다 (먼저 수집한 보고서가 소유)
 *  - 보고서 삭제 시 폴더·파일을 휴지통으로 내리고 보고서 참조를 끊는다
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReportFileFilerTest {

    @Mock StorageFolderRepository folderRepository;
    @Mock StorageFileRepository fileRepository;
    @Mock BoardRepository boardRepository;

    @InjectMocks ReportFileFiler filer;

    private User owner;

    @BeforeEach
    void setUp() {
        owner = mock(User.class);
        Board board = mock(Board.class);
        when(board.getOwner()).thenReturn(owner);
        when(boardRepository.findById("b1")).thenReturn(Optional.of(board));
        when(folderRepository.findActiveByBoardIdAndSystemKey(any(), any())).thenReturn(List.of());
        when(folderRepository.findActiveByBoardIdAndReportId(any(), any())).thenReturn(List.of());
        when(folderRepository.save(any(StorageFolder.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private StorageFile rootFile(String key) {
        return StorageFile.builder().boardId("b1").s3Key(key).originalFilename("image.png").build();
    }

    @Test
    void 수집한_파일을_루트_월_보고서_3단_폴더로_옮긴다() {
        StorageFile file = rootFile("reports/slack/c/f1.png");
        when(fileRepository.findByBoardIdAndS3Key("b1", "reports/slack/c/f1.png")).thenReturn(Optional.of(file));

        filer.fileReportFiles("b1", "r1", "2026-07", "일일 보고서 07-26", List.of("reports/slack/c/f1.png"));

        // 보고서 자료(0) → 2026-07(1) → 일일 보고서 07-26(2)
        verify(folderRepository, times(3)).save(any(StorageFolder.class));
        StorageFolder target = file.getFolder();
        assertNotNull(target);
        assertEquals("일일 보고서 07-26", target.getName());
        assertEquals("r1", target.getReportId());
        assertEquals(2, target.getDepth());
        assertEquals("2026-07", target.getParent().getName());
        assertEquals(ReportFileFiler.KEY_MONTH_PREFIX + "2026-07", target.getParent().getSystemKey());
        assertEquals(ReportFileFiler.KEY_ROOT, target.getParent().getParent().getSystemKey());
        assertNull(target.getParent().getParent().getParent());
    }

    @Test
    void 옮길_파일이_없으면_폴더를_만들지_않는다() {
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.empty());

        filer.fileReportFiles("b1", "r1", "2026-07", "주간 보고서 07-20~07-26", List.of("reports/slack/c/x.png"));

        verify(folderRepository, never()).save(any());
    }

    @Test
    void 이미_다른_폴더에_있는_파일은_건드리지_않는다() {
        StorageFolder existing = StorageFolder.builder().id("f0").name("일일 보고서 07-25").reportId("r0").build();
        StorageFile file = rootFile("reports/slack/c/shared.png");
        file.moveToFolder(existing);
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.of(file));

        filer.fileReportFiles("b1", "r1", "2026-07", "주간 보고서 07-20~07-26", List.of("reports/slack/c/shared.png"));

        assertSame(existing, file.getFolder(), "먼저 수집한 보고서가 계속 소유한다");
        verify(folderRepository, never()).save(any());
    }

    @Test
    void 보드_소유자를_못찾으면_건너뛴다() {
        when(boardRepository.findById("b1")).thenReturn(Optional.empty());
        when(fileRepository.findByBoardIdAndS3Key(any(), any())).thenReturn(Optional.of(rootFile("reports/a.png")));

        filer.fileReportFiles("b1", "r1", "2026-07", "일일 보고서 07-26", List.of("reports/a.png"));

        verify(folderRepository, never()).save(any());
    }

    @Test
    void 보고서를_지우면_폴더와_파일이_휴지통으로_가고_참조가_끊긴다() {
        StorageFolder month = StorageFolder.builder()
                .id("m1").name("2026-07").systemKey(ReportFileFiler.KEY_MONTH_PREFIX + "2026-07").build();
        StorageFolder folder = StorageFolder.builder()
                .id("f1").name("일일 보고서 07-26").reportId("r1").parent(month).createdBy(owner).build();
        StorageFile file = rootFile("reports/slack/c/f1.png");
        file.moveToFolder(folder);

        when(folderRepository.findActiveByBoardIdAndReportId("b1", "r1")).thenReturn(List.of(folder));
        when(fileRepository.findActiveByFolderId("f1")).thenReturn(List.of(file));
        when(folderRepository.findChildrenByParentId(any())).thenReturn(List.of());
        when(fileRepository.findActiveByFolderId("m1")).thenReturn(List.of());

        int discarded = filer.discardReportFolder("b1", "r1");

        assertEquals(1, discarded);
        assertTrue(folder.getIsDeleted());
        assertTrue(file.getIsDeleted(), "폴더 안 파일도 함께 휴지통으로");
        assertNull(folder.getReportId(), "사라진 보고서를 가리키는 참조는 끊는다");
        assertTrue(month.getIsDeleted(), "비어버린 월 폴더도 함께 내린다");
        verify(fileRepository, never()).delete(any());   // soft delete — 완전 삭제 아님
    }

    @Test
    void 월_폴더에_다른_보고서가_남아있으면_월_폴더는_유지한다() {
        StorageFolder month = StorageFolder.builder()
                .id("m1").name("2026-07").systemKey(ReportFileFiler.KEY_MONTH_PREFIX + "2026-07").build();
        StorageFolder sibling = StorageFolder.builder()
                .id("f0").name("일일 보고서 07-25").reportId("r0").parent(month).build();
        StorageFolder folder = StorageFolder.builder()
                .id("f1").name("일일 보고서 07-26").reportId("r1").parent(month).createdBy(owner).build();

        when(folderRepository.findActiveByBoardIdAndReportId("b1", "r1")).thenReturn(List.of(folder));
        when(fileRepository.findActiveByFolderId(any())).thenReturn(List.of());
        when(folderRepository.findChildrenByParentId("f1")).thenReturn(List.of());
        when(folderRepository.findChildrenByParentId("m1")).thenReturn(List.of(sibling));

        filer.discardReportFolder("b1", "r1");

        assertTrue(folder.getIsDeleted());
        assertFalse(month.getIsDeleted());
    }

    @Test
    void 폴더가_없으면_아무것도_하지_않는다() {
        when(folderRepository.findActiveByBoardIdAndReportId("b1", "r1")).thenReturn(List.of());

        assertEquals(0, filer.discardReportFolder("b1", "r1"));
        assertEquals(0, filer.discardReportFolder(null, "r1"));
        verifyNoInteractions(fileRepository);
    }
}
