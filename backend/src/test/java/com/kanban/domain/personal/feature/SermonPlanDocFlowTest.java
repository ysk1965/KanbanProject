package com.kanban.domain.personal.feature;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocResponse;
import com.kanban.domain.personal.feature.service.PersonalFeatureDocService;
import com.kanban.domain.personal.feature.service.PersonalFeatureTermService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** 설교 노트 홈 「한 주 동안」 직접 적은 할 일 — feature_key 'sermon_plan', 한 주 = 문서 하나 (test 프로파일, H2) */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("한 주 동안 할 일 문서")
class SermonPlanDocFlowTest {

    private static final String KEY = PersonalFeatureTermService.FEATURE_SERMON_PLAN;

    @Autowired
    PersonalFeatureDocService docService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    @DisplayName("만들기 · 목록(title = 그 주 일요일) · content 통째 교체 · 설교 노트 목록과 섞이지 않는다")
    @SuppressWarnings("unchecked")
    void createListPatch() {
        String me = userRepository
                .save(User.builder()
                        .email("plan-" + UUID.randomUUID() + "@example.com")
                        .name("한주")
                        .build())
                .getId();

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", "p1");
        item.put("text", "자기 전 감사 기도");
        item.put("rep", "daily");
        item.put("short", "감사기도");
        item.put("log", List.of("2026-10-26"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "2026-10-25");
        body.put("content", Map.of("week", "2026-10-25", "items", List.of(item)));
        body.put("schema_ver", 1);
        PersonalFeatureDocResponse.Detail made =
                docService.create(me, KEY, objectMapper.convertValue(body, PersonalFeatureDocRequest.Create.class));

        assertThat(docService.list(me, KEY))
                .extracting(PersonalFeatureDocResponse.Summary::getTitle)
                .containsExactly("2026-10-25");
        assertThat(docService.list(me, PersonalFeatureTermService.FEATURE_SERMON))
                .isEmpty();

        item.put("log", List.of("2026-10-26", "2026-10-27"));
        PersonalFeatureDocResponse.Detail patched = docService.patch(
                me,
                KEY,
                made.getId(),
                objectMapper.convertValue(
                        Map.of("content", Map.of("week", "2026-10-25", "items", List.of(item))),
                        PersonalFeatureDocRequest.Patch.class));
        List<Map<String, Object>> items =
                (List<Map<String, Object>>) ((Map<String, Object>) patched.getContent()).get("items");
        assertThat(items.get(0).get("log")).isEqualTo(List.of("2026-10-26", "2026-10-27"));
    }
}
