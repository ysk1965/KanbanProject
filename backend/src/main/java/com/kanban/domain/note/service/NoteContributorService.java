package com.kanban.domain.note.service;

import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteVersionRepository;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 노트 기여자 목록: 최근 버전 작성자(최신순) → updated_by → created_by.
 * id 기준 중복 제거, 최대 {@link #MAX_CONTRIBUTORS}명. 버전 content 는 로딩하지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NoteContributorService {

    public static final int MAX_CONTRIBUTORS = 20;

    private final NoteVersionRepository noteVersionRepository;
    private final UserRepository userRepository;

    public List<NoteResponse.UserInfo> resolve(Note note) {
        // 1) 버전 작성자 id (최신순)
        List<String> orderedIds = new ArrayList<>();
        for (Object[] row : noteVersionRepository.findDistinctAuthorIdsByNoteIdOrderByLatest(
                note.getId(), PageRequest.of(0, MAX_CONTRIBUTORS))) {
            if (row[0] != null) orderedIds.add((String) row[0]);
        }

        Map<String, User> byId = new LinkedHashMap<>();
        if (!orderedIds.isEmpty()) {
            for (User u : userRepository.findAllById(orderedIds)) {
                byId.put(u.getId(), u);
            }
        }

        // 2) updated_by, created_by 를 뒤에 덧붙임 (이미 있으면 스킵)
        LinkedHashMap<String, User> ordered = new LinkedHashMap<>();
        for (String id : orderedIds) {
            User u = byId.get(id);
            if (u != null) ordered.putIfAbsent(id, u);
        }
        if (note.getUpdatedBy() != null) ordered.putIfAbsent(note.getUpdatedBy().getId(), note.getUpdatedBy());
        if (note.getCreatedBy() != null) ordered.putIfAbsent(note.getCreatedBy().getId(), note.getCreatedBy());

        return ordered.values().stream()
                .limit(MAX_CONTRIBUTORS)
                .map(NoteResponse.UserInfo::of)
                .toList();
    }
}
