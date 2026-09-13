package com.kanban.global.scheduler;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.service.NoteHardDeleteSupport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 휴지통에 30일 이상 머문 노트를 영구 삭제한다.
 * Daily 03:00 UTC.
 *
 * <p>종속 행 정리는 서비스 레이어와 공유하는 {@link NoteHardDeleteSupport} 에 위임한다.
 * (과거에는 여기서 note_likes / note_draft_archives 를 빼먹어 좋아요가 있는 노트에서 FK 위반으로 실패했다.)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NoteTrashCleanupScheduler {

    private static final int RETENTION_DAYS = 30;

    private final NoteRepository noteRepository;
    private final NoteHardDeleteSupport noteHardDeleteSupport;

    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    @SchedulerLock(name = "NoteTrashCleanupScheduler.cleanupExpiredTrash", lockAtMostFor = "30m", lockAtLeastFor = "5m")
    @Transactional
    public void cleanupExpiredTrash() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(RETENTION_DAYS);
        List<Note> expired = noteRepository.findExpiredTrash(cutoff);
        if (expired.isEmpty()) {
            log.debug("No expired trash notes to clean up");
            return;
        }
        log.info("NoteTrashCleanup: deleting {} expired notes (cutoff={})", expired.size(), cutoff);

        // 부모도 만료 대상이면 부모쪽에서 cascade 처리 → 서브트리 루트만 직접 호출
        Set<String> expiredIds = expired.stream().map(Note::getId).collect(Collectors.toSet());
        List<Note> roots = expired.stream()
                .filter(n -> n.getParent() == null || !expiredIds.contains(n.getParent().getId()))
                .toList();

        int deleted = 0;
        for (Note root : roots) {
            deleted += noteHardDeleteSupport.hardDeleteRecursive(root);
        }
        log.info("NoteTrashCleanup: permanently deleted {} notes ({}+ days old)", deleted, RETENTION_DAYS);
    }
}
