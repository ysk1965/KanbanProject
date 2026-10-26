package com.kanban.domain.sermonnote.service;

import com.kanban.domain.personal.feature.PersonalFeatureDoc;
import com.kanban.domain.personal.feature.PersonalFeatureDocRepository;
import com.kanban.domain.personal.feature.service.PersonalFeatureTermService;
import com.kanban.domain.sermonnote.SermonNoteVersion;
import com.kanban.domain.sermonnote.SermonNoteVersionRepository;
import com.kanban.domain.sermonnote.dto.SermonNoteVersionDto;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 설교 노트 버전 기록 — 기기가 찍은 버전을 서버에 올려 두고 다른 기기에서도 되돌릴 수 있게 한다.
 *
 * <p>노트는 내 것이고 살아 있는(deleted_at null) 설교 노트여야 한다 — 아니면 모두 SNV001(404).
 * 같은 id 를 다시 올리면 저장된 것을 그대로 돌려준다(오프라인 재전송). 노트마다 최근 {@value #MAX_PER_NOTE}장만 남긴다.
 */
@Service
@RequiredArgsConstructor
public class SermonNoteVersionService {

    public static final int MAX_PER_NOTE = 30;
    public static final int MAX_BODY_BYTES = 256 * 1024;
    public static final int TITLE_MAX = 200;
    public static final Set<String> REASONS = Set.of("open", "auto", "close", "restore");

    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{8,36}$");

    private final SermonNoteVersionRepository versionRepository;
    private final PersonalFeatureDocRepository docRepository;

    @Transactional(readOnly = true)
    public SermonNoteVersionDto.Items list(String userId, String noteId) {
        requireNote(userId, noteId);
        return new SermonNoteVersionDto.Items(versionRepository.findRows(userId, noteId).stream()
                .map(SermonNoteVersionDto.Row::toItem)
                .toList());
    }

    @Transactional(readOnly = true)
    public SermonNoteVersionDto.Item get(String userId, String noteId, String id) {
        requireNote(userId, noteId);
        SermonNoteVersion v = versionRepository
                .findById(id)
                .filter(x -> x.getUserId().equals(userId) && x.getNoteId().equals(noteId))
                .orElseThrow(SermonNoteVersionService::notFound);
        return item(v, true);
    }

    @Transactional
    public SermonNoteVersionDto.Item put(String userId, String noteId, String id, SermonNoteVersionDto.Put req) {
        requireNote(userId, noteId);
        if (id == null || !ID.matcher(id).matches()) throw invalid();
        SermonNoteVersion existing = versionRepository.findById(id).orElse(null);
        if (existing != null) {
            // 같은 id 재전송 = 그대로. 다른 노트/사람의 id 와 겹치면 받지 않는다
            if (!existing.getUserId().equals(userId) || !existing.getNoteId().equals(noteId)) throw invalid();
            return item(existing, false);
        }
        if (req == null || req.getAt() == null || req.getBody() == null) throw invalid();
        if (req.getReason() == null || !REASONS.contains(req.getReason())) throw invalid();
        String body = req.getBody();
        if (body.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) throw invalid();
        int chars = req.getChars() != null ? req.getChars() : body.codePointCount(0, body.length());
        if (chars < 0) throw invalid();

        SermonNoteVersion v = versionRepository.save(SermonNoteVersion.builder()
                .id(id)
                .userId(userId)
                .noteId(noteId)
                .reason(req.getReason())
                .title(title(req.getTitle()))
                .body(body)
                .chars(chars)
                .at(LocalDateTime.ofInstant(Instant.ofEpochMilli(req.getAt()), ZoneOffset.UTC))
                .build());
        versionRepository.flush();
        trim(userId, noteId);
        return item(v, false);
    }

    /** 노트를 지울 때 (같은 트랜잭션) */
    @Transactional
    public int deleteAllOf(String userId, String noteId) {
        return versionRepository.deleteByNote(userId, noteId);
    }

    // ───────────────── 내부 ─────────────────

    private void trim(String userId, String noteId) {
        List<String> ids = versionRepository.findIdsNewestFirst(userId, noteId);
        if (ids.size() > MAX_PER_NOTE) {
            versionRepository.deleteByIds(ids.subList(MAX_PER_NOTE, ids.size()));
        }
    }

    private void requireNote(String userId, String noteId) {
        if (noteId == null) throw notFound();
        PersonalFeatureDoc doc = docRepository.findById(noteId).orElseThrow(SermonNoteVersionService::notFound);
        if (!doc.getUser().getId().equals(userId)
                || doc.isDeleted()
                || !PersonalFeatureTermService.FEATURE_SERMON.equals(doc.getFeatureKey())) {
            throw notFound();
        }
    }

    /** 앞뒤 공백 제거, 빈 값 = null, 200자(코드포인트) 넘으면 잘라 둔다 */
    private static String title(String v) {
        if (v == null) return null;
        String t = v.strip();
        if (t.isEmpty()) return null;
        if (t.codePointCount(0, t.length()) > TITLE_MAX) t = t.substring(0, t.offsetByCodePoints(0, TITLE_MAX));
        return t;
    }

    private static SermonNoteVersionDto.Item item(SermonNoteVersion v, boolean withBody) {
        return SermonNoteVersionDto.Item.builder()
                .id(v.getId())
                .noteId(v.getNoteId())
                .reason(v.getReason())
                .title(v.getTitle())
                .chars(v.getChars())
                .at(SermonNoteVersionDto.millis(v.getAt()))
                .body(withBody ? v.getBody() : null)
                .build();
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.SERMON_NOTE_VERSION_INVALID);
    }
}
