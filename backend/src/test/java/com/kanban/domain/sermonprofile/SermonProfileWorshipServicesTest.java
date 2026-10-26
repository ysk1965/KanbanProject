package com.kanban.domain.sermonprofile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.sermonprofile.service.SermonProfileService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** 이름표의 「내 예배표」 (worship_services) */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 이름표 내 예배표")
class SermonProfileWorshipServicesTest {

    @Autowired
    SermonProfileService profileService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    @DisplayName("기본 [], 저장하면 정리된 모양으로, 필드를 빼면 남고 [] 면 비운다")
    void roundTrip() throws Exception {
        String me = newUser("예배표");
        assertThat(profileService.getMe(me).getWorshipServices()).isEmpty();

        // 클라이언트가 보낸 JSON 그대로 (snake_case 키, 모르는 키 포함)
        SermonProfileDto.Update req = objectMapper.readValue("""
                {"worship_services": [
                  {"id": "sun2", "name": "  주일 2부  ", "unknown": 1,
                   "slots": [{"dow": 0, "start": "11:00", "end": "12:30", "part": "2부", "x": true}],
                   "my_part": "찬양", "galpi": true,
                   "groups": [{"group_id": "g-1", "service_id": "sun", "extra": "no"}]},
                  {"id": "wed", "name": "수요예배", "slots": [{"dow": 3, "start": "19:30", "end": "21:00"}],
                   "auto": false, "galpi": true}
                ]}
                """, SermonProfileDto.Update.class);
        SermonProfileDto.Profile saved = profileService.putMe(me, req);
        List<Map<String, Object>> ws = saved.getWorshipServices();
        assertThat(ws).hasSize(2);
        Map<String, Object> first = ws.get(0);
        assertThat(first)
                .containsOnlyKeys("id", "name", "slots", "my_part", "auto", "galpi", "groups")
                .containsEntry("id", "sun2")
                .containsEntry("name", "주일 2부")
                .containsEntry("my_part", "찬양")
                .containsEntry("auto", true)
                .containsEntry("galpi", true);
        assertThat(first.get("slots"))
                .isEqualTo(List.of(Map.of("dow", 0, "start", "11:00", "end", "12:30", "part", "2부")));
        assertThat(first.get("groups")).isEqualTo(List.of(Map.of("group_id", "g-1", "service_id", "sun")));
        // galpi 는 처음 하나만
        assertThat(ws.get(1)).containsEntry("auto", false).containsEntry("galpi", false);

        // 다시 읽어도 같다 (JSON 컬럼 왕복)
        assertThat(profileService.getMe(me).getWorshipServices()).isEqualTo(ws);

        // 옛 클라이언트 — 필드가 없으면 남는다
        SermonProfileDto.Update old = new SermonProfileDto.Update();
        old.setInk("mint");
        assertThat(profileService.putMe(me, old).getWorshipServices()).hasSize(2);

        // JSON 응답 키는 worship_services
        Map<String, Object> json = objectMapper.convertValue(saved, new TypeReference<Map<String, Object>>() {});
        assertThat(json).containsKey("worship_services");

        // [] = 비우기
        SermonProfileDto.Update clear = new SermonProfileDto.Update();
        clear.setWorshipServices(List.of());
        assertThat(profileService.putMe(me, clear).getWorshipServices()).isEmpty();
        assertThat(profileService.getMe(me).getWorshipServices()).isEmpty();
    }

    @Test
    @DisplayName("처음 저장에 함께 오면 그대로 저장")
    void firstSave() {
        String me = newUser("처음");
        SermonProfileDto.Update req = new SermonProfileDto.Update();
        req.setWorshipServices(List.of(service()));
        assertThat(profileService.putMe(me, req).getWorshipServices())
                .singleElement()
                .satisfies(m -> assertThat(m).containsEntry("auto", true).containsEntry("galpi", false));
    }

    @Test
    @DisplayName("어긋나면 SPF001 — 개수·길이·요일·시간·타입")
    void validation() {
        String me = newUser("검증");
        expectInvalid(me, thirteen());
        expectInvalid(me, List.of(with(m -> m.put("id", "a".repeat(21)))));
        expectInvalid(me, List.of(with(m -> m.put("id", "  "))));
        expectInvalid(me, List.of(with(m -> m.remove("name"))));
        expectInvalid(me, List.of(with(m -> m.put("name", "가".repeat(31)))));
        expectInvalid(me, List.of(with(m -> m.put("my_part", "가".repeat(11)))));
        expectInvalid(me, List.of(with(m -> m.put("auto", "yes"))));
        expectInvalid(me, List.of(with(m -> m.put("slots", List.of(slot(7, "10:00", "11:00"))))));
        expectInvalid(me, List.of(with(m -> m.put("slots", List.of(slot(0, "24:00", "11:00"))))));
        expectInvalid(me, List.of(with(m -> m.put("slots", List.of(slot(0, "9:00", "11:00"))))));
        List<Map<String, Object>> manySlots = new ArrayList<>();
        for (int i = 0; i < 15; i++) manySlots.add(slot(i % 7, "10:00", "11:00"));
        expectInvalid(me, List.of(with(m -> m.put("slots", manySlots))));
        expectInvalid(
                me,
                List.of(with(m -> m.put("groups", List.of(Map.of("group_id", "g".repeat(37), "service_id", "s"))))));
        List<Map<String, Object>> manyGroups = new ArrayList<>();
        for (int i = 0; i < 21; i++) manyGroups.add(Map.of("group_id", "g" + i, "service_id", "s"));
        expectInvalid(me, List.of(with(m -> m.put("groups", manyGroups))));

        // 경계값은 통과
        List<Map<String, Object>> twelve = new ArrayList<>();
        for (int i = 0; i < 12; i++) twelve.add(with(m -> m.put("name", "가".repeat(30))));
        SermonProfileDto.Update ok = new SermonProfileDto.Update();
        ok.setWorshipServices(twelve);
        assertThat(profileService.putMe(me, ok).getWorshipServices()).hasSize(12);
    }

    private List<Map<String, Object>> thirteen() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < 13; i++) list.add(service());
        return list;
    }

    private void expectInvalid(String me, List<Map<String, Object>> services) {
        SermonProfileDto.Update req = new SermonProfileDto.Update();
        req.setWorshipServices(services);
        assertThatThrownBy(() -> profileService.putMe(me, req))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SERMON_PROFILE_INVALID_INPUT);
    }

    private static Map<String, Object> service() {
        Map<String, Object> m = new HashMap<>();
        m.put("id", "sun");
        m.put("name", "주일예배");
        m.put("slots", List.of(slot(0, "11:00", "12:00")));
        return m;
    }

    private static Map<String, Object> with(Consumer<Map<String, Object>> edit) {
        Map<String, Object> m = service();
        edit.accept(m);
        return m;
    }

    private static Map<String, Object> slot(int dow, String start, String end) {
        Map<String, Object> m = new HashMap<>();
        m.put("dow", dow);
        m.put("start", start);
        m.put("end", end);
        return m;
    }

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("worship-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }
}
