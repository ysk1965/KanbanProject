package com.kanban.domain.sermonhighlight.service;

import com.kanban.domain.sermonhighlight.SermonHighlight;
import com.kanban.domain.sermonhighlight.SermonHighlightRepository;
import com.kanban.domain.sermonhighlight.dto.SermonHighlightDto;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 성경 읽기 「형광펜」 — 나만 보는 데이터. 기기가 먼저 칠하고 올리므로 PUT 은 upsert, DELETE 는 소프트 삭제(멱등).
 *
 * <p>다른 사람의 id 로 PUT/DELETE 하면 없는 것처럼 404. 지운 id 에 다시 PUT 하면 되살리지 않고 deleted=true 로 돌려준다 — 다른 기기에서 지운 걸
 * 늦게 올라온 수정이 되살리지 않게.
 */
@Service
@RequiredArgsConstructor
public class SermonHighlightService {

    public static final Set<String> COLORS = Set.of("yellow", "green", "blue", "pink");
    public static final int BOOKS = 66;
    public static final int MAX_CHAPTER = 150;
    public static final int MAX_VERSE = 176;
    /** 한 줄이 걸칠 수 있는 절 수 */
    public static final int MAX_SPAN = 30;

    public static final int MAX_CHAR = 2000;
    public static final int MEMO_MAX = 200;
    public static final int MAX_PER_USER = 5000;

    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{8,36}$");

    private final SermonHighlightRepository repository;

    @Transactional(readOnly = true)
    public List<SermonHighlightDto.Item> list(String userId) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByBookAscChapterAscVerseFromAsc(userId).stream()
                .map(SermonHighlightService::toItem)
                .toList();
    }

    @Transactional
    public SermonHighlightDto.Item upsert(String userId, String id, SermonHighlightDto.Upsert req) {
        if (id == null || !ID.matcher(id).matches() || req == null) throw invalid();
        int book = req.getBook() == null ? -1 : req.getBook();
        int chapter = req.getChapter() == null ? 0 : req.getChapter();
        int from = req.getVerseFrom() == null ? 0 : req.getVerseFrom();
        int to = req.getVerseTo() == null ? from : req.getVerseTo();
        if (book < 0 || book >= BOOKS || chapter < 1 || chapter > MAX_CHAPTER) throw invalid();
        if (from < 1 || to < from || to > MAX_VERSE || to - from >= MAX_SPAN) throw invalid();
        Integer cs = req.getCharStart();
        Integer ce = req.getCharEnd();
        if (cs != null && (cs < 0 || cs > MAX_CHAR)) throw invalid();
        if (ce != null && (ce < 1 || ce > MAX_CHAR)) throw invalid();
        if (cs != null && ce != null && from == to && ce <= cs) throw invalid();
        if (cs != null && cs == 0) cs = null;
        String color = req.getColor() == null || req.getColor().isBlank() ? null : req.getColor();
        if (color != null && !COLORS.contains(color)) throw invalid();
        boolean underline = Boolean.TRUE.equals(req.getUnderline());
        String memo = req.getMemo() == null ? null : req.getMemo().strip();
        if (memo != null && memo.isEmpty()) memo = null;
        if (memo != null && memo.length() > MEMO_MAX) throw invalid();
        if (color == null && !underline && memo == null) throw invalid();

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        SermonHighlight h = repository.findById(id).orElse(null);
        if (h != null && !h.getUserId().equals(userId)) throw notFound();
        if (h != null && h.isDeleted()) return toItem(h);
        if (h == null) {
            if (repository.countByUserIdAndDeletedAtIsNull(userId) >= MAX_PER_USER)
                throw new BusinessException(ErrorCode.SERMON_HIGHLIGHT_LIMIT);
            h = SermonHighlight.builder()
                    .id(id)
                    .userId(userId)
                    .createdAt(now)
                    .updatedAt(now)
                    .build();
        }
        h.apply(book, chapter, from, to, cs, ce, color, underline, memo, now);
        return toItem(repository.save(h));
    }

    @Transactional
    public void delete(String userId, String id) {
        if (id == null || !ID.matcher(id).matches()) throw invalid();
        SermonHighlight h = repository.findById(id).orElse(null);
        if (h == null) return; // 올리기 전에 지운 것 — 멱등
        if (!h.getUserId().equals(userId)) throw notFound();
        h.delete(LocalDateTime.now(ZoneOffset.UTC));
    }

    private static SermonHighlightDto.Item toItem(SermonHighlight h) {
        return SermonHighlightDto.Item.builder()
                .id(h.getId())
                .book(h.getBook())
                .chapter(h.getChapter())
                .verseFrom(h.getVerseFrom())
                .verseTo(h.getVerseTo())
                .charStart(h.getCharStart())
                .charEnd(h.getCharEnd())
                .color(h.getColor())
                .underline(h.isUnderline())
                .memo(h.getMemo())
                .deleted(h.isDeleted())
                .createdAt(h.getCreatedAt())
                .updatedAt(h.getUpdatedAt())
                .build();
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.SERMON_HIGHLIGHT_INVALID_INPUT);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.SERMON_HIGHLIGHT_NOT_FOUND);
    }
}
