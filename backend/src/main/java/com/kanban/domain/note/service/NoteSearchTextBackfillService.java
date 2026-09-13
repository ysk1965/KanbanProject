package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** search_text 가 비어 있는 노트를 배치 단위로 채운다. 배치 하나가 트랜잭션 하나. */
@Service
@RequiredArgsConstructor
public class NoteSearchTextBackfillService {

    private final NoteRepository noteRepository;

    @Transactional(readOnly = true)
    public long countPending() {
        return noteRepository.countBySearchTextIsNull();
    }

    /** @return 이번 배치에서 갱신한 노트 수 (0 이면 더 이상 없음) */
    @Transactional
    public int backfillBatch(int batchSize) {
        List<Note> batch = noteRepository.findBySearchTextIsNull(PageRequest.of(0, batchSize));
        for (Note note : batch) {
            note.refreshSearchText(); // 항상 non-null 이라 다음 조회에서 재선택되지 않는다
        }
        return batch.size();
    }
}
