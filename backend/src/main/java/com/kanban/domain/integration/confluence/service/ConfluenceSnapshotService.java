package com.kanban.domain.integration.confluence.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.confluence.ConfluenceTreeSnapshot;
import com.kanban.domain.integration.confluence.ConfluenceTreeSnapshotRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 부모 트리의 페이지 집합 스냅샷을 읽고 쓴다 — 삭제 감지의 기준선.
 *
 * <p>수집({@link ConfluenceWeeklySource})은 HTTP를 트랜잭션 밖에서 하므로, DB 접근인
 * 로드/저장만 여기서 짧은 트랜잭션으로 처리해 HTTP와 섞이지 않게 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConfluenceSnapshotService {

    private static final TypeReference<List<Map<String, String>>> ENTRY_LIST =
            new TypeReference<>() {};

    private final ConfluenceTreeSnapshotRepository repository;
    private final ObjectMapper objectMapper;

    /**
     * 직전 수집의 (id → title) 집합. 비어 있는 {@link Optional}이면 <b>기준선이 없다</b>(첫 수집)는 뜻으로,
     * 이때는 삭제를 판정하지 않는다 — 없던 걸 지웠다고 오판하지 않기 위해.
     */
    @Transactional(readOnly = true)
    public Optional<Map<String, String>> loadPrior(String boardId, String spaceKey, String parentPageId) {
        return repository.findByBoardIdAndSpaceKeyAndParentPageId(boardId, spaceKey, parentPageId)
                .map(snapshot -> parse(snapshot.getEntries()));
    }

    /** 이번 수집의 트리 집합을 기준선으로 저장(업서트). */
    @Transactional
    public void save(String boardId, String spaceKey, String parentPageId, Map<String, String> current) {
        String json = serialize(current);
        repository.findByBoardIdAndSpaceKeyAndParentPageId(boardId, spaceKey, parentPageId)
                .ifPresentOrElse(
                        snapshot -> snapshot.updateEntries(json),
                        () -> repository.save(ConfluenceTreeSnapshot.builder()
                                .boardId(boardId)
                                .spaceKey(spaceKey)
                                .parentPageId(parentPageId)
                                .entries(json)
                                .build()));
    }

    private Map<String, String> parse(String entries) {
        Map<String, String> map = new LinkedHashMap<>();
        if (entries == null || entries.isBlank()) {
            return map;
        }
        try {
            for (Map<String, String> entry : objectMapper.readValue(entries, ENTRY_LIST)) {
                String id = entry.get("id");
                if (id != null) {
                    map.put(id, entry.getOrDefault("title", ""));
                }
            }
        } catch (Exception e) {
            log.warn("Confluence 트리 스냅샷 파싱 실패: {}", e.getMessage());
        }
        return map;
    }

    private String serialize(Map<String, String> current) {
        List<Map<String, String>> entries = current.entrySet().stream()
                .map(e -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("id", e.getKey());
                    m.put("title", e.getValue());
                    return m;
                })
                .toList();
        try {
            return objectMapper.writeValueAsString(entries);
        } catch (Exception e) {
            log.warn("Confluence 트리 스냅샷 직렬화 실패: {}", e.getMessage());
            return "[]";
        }
    }
}
