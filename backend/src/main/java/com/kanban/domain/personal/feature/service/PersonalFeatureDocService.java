package com.kanban.domain.personal.feature.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.personal.feature.PersonalFeatureDoc;
import com.kanban.domain.personal.feature.PersonalFeatureDocRepository;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「기능」 탭 문서 저장소.
 *
 * <p>권한은 user_id = 요청자만. 보드 공유가 붙기 전까지 다른 사용자가 볼 경로가 없다.
 * 요금제 제한은 두지 않되 문서 수 상한만 상수로 둔다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalFeatureDocService {

    /** 서버가 아는 기능. 새 기능은 여기 한 줄 + 프런트 레지스트리 한 줄. */
    public static final Set<String> FEATURE_KEYS = Set.of(PersonalFeatureTermService.FEATURE_TIMETABLE);

    /** content 직렬화 크기 상한 — 자동 저장이 800ms마다 오므로 너무 큰 문서는 애초에 막는다. */
    public static final int MAX_CONTENT_BYTES = 256 * 1024;

    /** 사용자 × 기능당 살아 있는 문서 상한 */
    public static final int MAX_DOCS_PER_FEATURE = 200;

    private static final String DUPLICATE_SUFFIX = " (복사본)";
    private static final int TITLE_MAX_LENGTH = 200;

    private final PersonalFeatureDocRepository docRepository;
    private final PersonalFeatureTermService termService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public List<PersonalFeatureDocResponse.Summary> list(String userId, String featureKey) {
        validateFeatureKey(featureKey);
        return docRepository.findSummaries(userId, featureKey).stream()
                .map(PersonalFeatureDocResponse.Summary::of)
                .toList();
    }

    public PersonalFeatureDocResponse.Detail get(String userId, String featureKey, String docId) {
        validateFeatureKey(featureKey);
        return PersonalFeatureDocResponse.Detail.of(findDocAndVerifyOwner(userId, featureKey, docId));
    }

    @Transactional
    public PersonalFeatureDocResponse.Detail create(String userId, String featureKey,
                                                    PersonalFeatureDocRequest.Create request) {
        validateFeatureKey(featureKey);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        ensureCapacity(userId, featureKey);

        Map<String, Object> content = request.getContent() != null
                ? request.getContent()
                : new LinkedHashMap<>();
        validateContentSize(content);

        PersonalFeatureDoc doc = docRepository.save(PersonalFeatureDoc.builder()
                .user(user)
                .featureKey(featureKey)
                .title(request.getTitle().trim())
                .content(content)
                .schemaVer(request.getSchemaVer() != null ? request.getSchemaVer() : 1)
                .build());

        termService.upsertFromContent(userId, featureKey, content);
        return PersonalFeatureDocResponse.Detail.of(doc);
    }

    @Transactional
    public PersonalFeatureDocResponse.Detail patch(String userId, String featureKey, String docId,
                                                   PersonalFeatureDocRequest.Patch request) {
        validateFeatureKey(featureKey);
        PersonalFeatureDoc doc = findDocAndVerifyOwner(userId, featureKey, docId);

        if (request.getTitle() != null) {
            String title = request.getTitle().trim();
            if (title.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
            doc.updateTitle(title);
        }
        if (request.getContent() != null) {
            validateContentSize(request.getContent());
            doc.updateContent(request.getContent());
            termService.upsertFromContent(userId, featureKey, request.getContent());
        }
        return PersonalFeatureDocResponse.Detail.of(doc);
    }

    @Transactional
    public PersonalFeatureDocResponse.Detail duplicate(String userId, String featureKey, String docId) {
        validateFeatureKey(featureKey);
        PersonalFeatureDoc source = findDocAndVerifyOwner(userId, featureKey, docId);
        ensureCapacity(userId, featureKey);

        String title = source.getTitle() + DUPLICATE_SUFFIX;
        if (title.length() > TITLE_MAX_LENGTH) {
            title = source.getTitle().substring(0, TITLE_MAX_LENGTH - DUPLICATE_SUFFIX.length()) + DUPLICATE_SUFFIX;
        }

        PersonalFeatureDoc copy = docRepository.save(PersonalFeatureDoc.builder()
                .user(source.getUser())
                .featureKey(source.getFeatureKey())
                .title(title)
                .content(deepCopy(source.getContent()))
                .schemaVer(source.getSchemaVer())
                .build());
        // 용어는 원본 저장 때 이미 기억했으므로 복제에서 다시 세지 않는다
        return PersonalFeatureDocResponse.Detail.of(copy);
    }

    @Transactional
    public void delete(String userId, String featureKey, String docId) {
        validateFeatureKey(featureKey);
        PersonalFeatureDoc doc = findDocAndVerifyOwner(userId, featureKey, docId);
        doc.softDelete();
    }

    // ───────────────── internal ─────────────────

    private PersonalFeatureDoc findDocAndVerifyOwner(String userId, String featureKey, String docId) {
        PersonalFeatureDoc doc = docRepository.findById(docId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_FEATURE_DOC_NOT_FOUND));
        if (!doc.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        // 다른 기능의 문서나 지운 문서는 이 경로에 없는 것으로 본다
        if (doc.isDeleted() || !doc.getFeatureKey().equals(featureKey)) {
            throw new BusinessException(ErrorCode.PERSONAL_FEATURE_DOC_NOT_FOUND);
        }
        return doc;
    }

    private void validateFeatureKey(String featureKey) {
        if (featureKey == null || !FEATURE_KEYS.contains(featureKey)) {
            throw new BusinessException(ErrorCode.PERSONAL_FEATURE_UNKNOWN);
        }
    }

    private void ensureCapacity(String userId, String featureKey) {
        if (docRepository.countLive(userId, featureKey) >= MAX_DOCS_PER_FEATURE) {
            throw new BusinessException(ErrorCode.PERSONAL_FEATURE_DOC_LIMIT_EXCEEDED);
        }
    }

    private void validateContentSize(Map<String, Object> content) {
        try {
            if (objectMapper.writeValueAsBytes(content).length > MAX_CONTENT_BYTES) {
                throw new BusinessException(ErrorCode.PERSONAL_FEATURE_CONTENT_TOO_LARGE);
            }
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    /** 원본과 복제본이 같은 Map 인스턴스를 공유하지 않도록 직렬화를 거쳐 복사한다. */
    private Map<String, Object> deepCopy(Map<String, Object> content) {
        if (content == null) return new LinkedHashMap<>();
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(content);
            return objectMapper.readValue(bytes, new TypeReference<Map<String, Object>>() {});
        } catch (java.io.IOException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }
}
