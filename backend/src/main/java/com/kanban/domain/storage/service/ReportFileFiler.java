package com.kanban.domain.storage.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolder;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

/**
 * 보고서가 자동 수집한 파일을 <b>보고서별 폴더</b>로 모으고, 보고서가 지워지면 그 폴더를 함께 내린다.
 *
 * <pre>
 * 보고서 자료/            system_key = REPORT_ROOT
 *   2026-07/             system_key = REPORT_MONTH:2026-07
 *     일일 보고서 07-26/   report_id  = {보고서 id}
 * </pre>
 *
 * <p>왜 수집이 아니라 저장 직후에 묶는가 — 수집 시점에는 보고서 행이 아직 없다(수집 → AI 작성 →
 * 저장 순). 그래서 수집은 지금처럼 폴더 없이 등록해 두고, 보고서가 저장된 뒤 그 회차가 옮긴
 * S3 키를 받아 한 번에 폴더로 옮긴다. AI 작성이 실패해 보고서가 안 남으면 폴더도 생기지 않는다.
 *
 * <p>스코프는 보드만 다룬다 — 자동 수집 파일은 보드 스토리지에만 등록되기 때문이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportFileFiler {

    public static final String KEY_ROOT = "REPORT_ROOT";
    public static final String KEY_MONTH_PREFIX = "REPORT_MONTH:";
    public static final String KEY_UNSORTED = "REPORT_UNSORTED";

    private static final String ROOT_NAME = "보고서 자료";
    private static final String UNSORTED_NAME = "미분류";

    /** 보고서 자동 수집으로 올라간 S3 객체의 키 프리픽스 */
    private static final String REPORT_KEY_PREFIX = "reports/";

    private final StorageFolderRepository folderRepository;
    private final StorageFileRepository fileRepository;
    private final BoardRepository boardRepository;

    /**
     * 이 보고서가 수집한 파일들을 보고서 폴더로 모은다.
     *
     * <p>독립 트랜잭션(REQUIRES_NEW)인 이유는 {@code registerReportFile}과 같다 — 정리 실패가
     * 보고서 생성·발송을 롤백시키면 안 된다. 호출부도 예외를 삼킨다.
     *
     * <p>규칙
     * <ul>
     *   <li>옮길 파일이 하나도 없으면 <b>폴더를 만들지 않는다</b>. 주간 보고서는 그 주 일일 보고서를
     *       재활용(롤업)해 새로 옮기는 파일이 없는 경우가 많은데, 그때마다 빈 폴더가 생기면 안 된다.</li>
     *   <li>이미 어떤 폴더에 들어 있는 파일은 건드리지 않는다. 일일·주간이 같은 슬랙 파일을 공유해도
     *       (S3 키가 같아 스토리지 행은 하나) <b>먼저 수집한 보고서</b>가 계속 소유한다.
     *       사용자가 직접 다른 폴더로 옮긴 파일도 같은 이유로 그대로 둔다.</li>
     * </ul>
     *
     * @param monthKey   {@code 2026-07} 형식의 월 폴더 키
     * @param folderName 보고서 폴더 이름 (예: {@code 일일 보고서 07-26})
     * @param s3Keys     이번 회차가 우리 스토리지로 옮긴 파일의 S3 키
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fileReportFiles(String boardId, String reportId, String monthKey,
                                String folderName, Collection<String> s3Keys) {
        if (boardId == null || reportId == null || s3Keys == null || s3Keys.isEmpty()) {
            return;
        }
        List<StorageFile> unfiled = findUnfiledFiles(boardId, s3Keys);
        if (unfiled.isEmpty()) {
            return;   // 이미 다른 보고서 폴더에 들어갔거나 등록에 실패한 경우 — 빈 폴더를 만들지 않는다
        }
        User actor = boardOwner(boardId);
        if (actor == null) {
            return;   // createdBy 를 채울 수 없으면 건너뛴다 (registerReportFile 과 같은 정책)
        }

        StorageFolder root = ensureSystemFolder(boardId, KEY_ROOT, ROOT_NAME, null, actor);
        StorageFolder month = ensureSystemFolder(boardId, KEY_MONTH_PREFIX + monthKey, monthKey, root, actor);
        StorageFolder target = ensureReportFolder(boardId, reportId, folderName, month, actor);

        for (StorageFile file : unfiled) {
            file.moveToFolder(target);
        }
        log.info("Report files filed: board={}, report={}, folder={}, moved={}",
                boardId, reportId, target.getId(), unfiled.size());
    }

    /**
     * 보고서를 지울 때 그 보고서 폴더를 휴지통으로 내린다(하위 파일 포함).
     * 완전 삭제가 아니라 soft delete 라 자료실 휴지통에서 되살릴 수 있다.
     *
     * <p>S3 객체는 남는다 — {@code hardDeleteFile}이 {@code reports/} 프리픽스 객체의 S3 삭제를
     * 건너뛰므로, 같은 이미지를 쓰는 다른 회차 보고서 본문이 깨지지 않는다.
     *
     * @return 휴지통으로 옮긴 파일 수
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int discardReportFolder(String boardId, String reportId) {
        if (boardId == null || reportId == null) {
            return 0;
        }
        Optional<StorageFolder> found = first(folderRepository.findActiveByBoardIdAndReportId(boardId, reportId));
        if (found.isEmpty()) {
            return 0;
        }
        StorageFolder folder = found.get();
        // 폴더를 만든 사람(보드 소유자)을 삭제 주체로 쓴다 — 자동 삭제라 행위자 사용자가 없다.
        User actor = folder.getCreatedBy();
        int discarded = softDeleteRecursive(folder, actor);
        // 이미 사라질 보고서를 가리키는 참조를 남기지 않는다.
        folder.detachReport();

        // 월 폴더가 비면 함께 내린다 — 빈 월 폴더가 쌓이지 않게.
        StorageFolder month = folder.getParent();
        if (month != null && month.getSystemKey() != null
                && month.getSystemKey().startsWith(KEY_MONTH_PREFIX)
                && folderRepository.findChildrenByParentId(month.getId()).isEmpty()
                && fileRepository.findActiveByFolderId(month.getId()).isEmpty()) {
            month.softDelete(actor);
        }

        log.info("Report folder discarded: board={}, report={}, folder={}, files={}",
                boardId, reportId, folder.getId(), discarded);
        return discarded;
    }

    /**
     * 아직 폴더에 들어가지 않은(=자료실 루트에 널려 있는) 자동 수집 파일의 S3 키.
     * 과거 파일을 보고서 폴더로 되돌리는 백필의 입력이다.
     */
    @Transactional(readOnly = true)
    public List<String> unfiledReportFileKeys(String boardId) {
        return fileRepository.findRootFilesByScope("BOARD", boardId).stream()
                .map(StorageFile::getS3Key)
                .filter(key -> key != null && key.startsWith(REPORT_KEY_PREFIX))
                .toList();
    }

    /**
     * 어느 보고서에서 왔는지 못 찾은 자동 수집 파일을 "보고서 자료/미분류"로 모은다.
     * (대부분 미리보기 실행으로 흘러든 파일이다.)
     *
     * @return 옮긴 파일 수
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int fileUnsorted(String boardId, Collection<String> s3Keys) {
        if (boardId == null || s3Keys == null || s3Keys.isEmpty()) {
            return 0;
        }
        List<StorageFile> unfiled = findUnfiledFiles(boardId, s3Keys);
        if (unfiled.isEmpty()) {
            return 0;
        }
        User actor = boardOwner(boardId);
        if (actor == null) {
            return 0;
        }
        StorageFolder root = ensureSystemFolder(boardId, KEY_ROOT, ROOT_NAME, null, actor);
        StorageFolder unsorted = ensureSystemFolder(boardId, KEY_UNSORTED, UNSORTED_NAME, root, actor);
        unfiled.forEach(file -> file.moveToFolder(unsorted));
        log.info("Report files filed as unsorted: board={}, moved={}", boardId, unfiled.size());
        return unfiled.size();
    }

    // ── 내부 ────────────────────────────────────────

    /** 아직 어느 폴더에도 들어가지 않은(=자료실 루트에 있는) 활성 파일만 고른다. */
    private List<StorageFile> findUnfiledFiles(String boardId, Collection<String> s3Keys) {
        List<StorageFile> files = new ArrayList<>();
        for (String key : new LinkedHashSet<>(s3Keys)) {
            fileRepository.findByBoardIdAndS3Key(boardId, key)
                    .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                    .filter(f -> f.getFolder() == null)
                    .ifPresent(files::add);
        }
        return files;
    }

    private StorageFolder ensureSystemFolder(String boardId, String systemKey, String name,
                                             StorageFolder parent, User actor) {
        return first(folderRepository.findActiveByBoardIdAndSystemKey(boardId, systemKey))
                .orElseGet(() -> createFolder(boardId, name, parent, actor, systemKey, null));
    }

    private StorageFolder ensureReportFolder(String boardId, String reportId, String name,
                                             StorageFolder parent, User actor) {
        // 재생성(regenerate)으로 같은 보고서를 다시 채우는 경우 기존 폴더를 그대로 쓴다.
        return first(folderRepository.findActiveByBoardIdAndReportId(boardId, reportId))
                .orElseGet(() -> createFolder(boardId, name, parent, actor, null, reportId));
    }

    private StorageFolder createFolder(String boardId, String name, StorageFolder parent,
                                       User actor, String systemKey, String reportId) {
        int position = parent != null
                ? folderRepository.findNextChildPosition(parent.getId())
                : folderRepository.findNextRootPositionByScope("BOARD", boardId);
        return folderRepository.save(StorageFolder.builder()
                .boardId(boardId)
                .parent(parent)
                .name(name)
                .position(position)
                .depth(parent != null ? parent.getDepth() + 1 : 0)
                .systemKey(systemKey)
                .reportId(reportId)
                .createdBy(actor)
                .updatedBy(actor)
                .build());
    }

    /** 폴더·하위 폴더·파일을 모두 휴지통으로. StorageService 의 같은 로직과 동작을 맞춘다. */
    private int softDeleteRecursive(StorageFolder folder, User actor) {
        folder.softDelete(actor);
        int count = 0;
        for (StorageFile file : fileRepository.findActiveByFolderId(folder.getId())) {
            file.softDelete(actor);
            count++;
        }
        for (StorageFolder child : folderRepository.findChildrenByParentId(folder.getId())) {
            count += softDeleteRecursive(child, actor);
        }
        return count;
    }

    private User boardOwner(String boardId) {
        Board board = boardRepository.findById(boardId).orElse(null);
        return board != null ? board.getOwner() : null;
    }

    private Optional<StorageFolder> first(List<StorageFolder> folders) {
        return folders.isEmpty() ? Optional.empty() : Optional.of(folders.get(0));
    }
}
