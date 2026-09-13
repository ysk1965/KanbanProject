package com.kanban.domain.note.service;

import com.kanban.domain.note.NoteStatus;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;

import java.util.Locale;

/** 요청 문자열 → {@link NoteStatus}. null/공백 = 해제(null), 알 수 없는 값 = 400. */
final class NoteStatusParser {

    private NoteStatusParser() {}

    static NoteStatus parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return NoteStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE,
                    "status 는 DRAFT, IN_REVIEW, DONE 중 하나여야 합니다");
        }
    }
}
