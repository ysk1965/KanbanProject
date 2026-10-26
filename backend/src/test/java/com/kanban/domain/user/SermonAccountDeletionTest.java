package com.kanban.domain.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.service.PersonalFeatureDocService;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.sermonprofile.service.SermonProfileService;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.user.service.UserService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 회원 탈퇴 — 설교 노트(갈피) 데이터가 남지 않고, 모임 리더는 넘어간다. test 프로파일(H2). */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("회원 탈퇴 · 갈피 데이터 정리")
class SermonAccountDeletionTest {

    private static final String BODY_120 = "<p>" + "말씀".repeat(30) + "</p><p>" + "은혜".repeat(30) + "</p>";

    @Autowired
    UserService userService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    PersonalFeatureDocService docService;

    @Autowired
    SermonGroupService groupService;

    @Autowired
    SermonProfileService profileService;

    @Autowired
    ChallengeClock clock;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    @DisplayName("노트·달란트·이름표·모임 사본이 지워지고 탈퇴가 성공한다, 리더는 먼저 들어온 멤버에게 넘어간다")
    void deletesSermonDataAndHandsOverLeader() {
        String a = newUser("에이");
        String b = newUser("비");
        String c = newUser("씨");
        SermonGroupResponse.Detail g = groupService.create(a, groupRequest());
        groupService.join(b, g.getInviteCode(), join("비"));
        groupService.join(c, g.getInviteCode(), join("씨"));

        createNote(a); // users FK 가 걸린 personal_feature_docs + 달란트 적립(지갑·원장·주간 점수)
        SermonProfileDto.Update profile = new SermonProfileDto.Update();
        profile.setMascot("bang");
        profile.setInk("mint");
        profile.setVerseRef("44:5:3-4");
        profile.setVerseStyle("hand");
        profileService.putMe(a, profile);
        assertThat(count("talent_ledger", a)).isPositive();

        userService.deleteAccount(a);

        assertThat(userRepository.findById(a)).isEmpty();
        for (String table : List.of(
                "personal_feature_docs",
                "talent_ledger",
                "talent_wallets",
                "weekly_scores",
                "sermon_profiles",
                "sermon_profile_verses",
                "sermon_group_members")) {
            assertThat(count(table, a)).as(table).isZero();
        }
        SermonGroupResponse.Detail after = groupService.get(b, g.getId());
        assertThat(after.getMe().getRole()).isEqualTo("leader");
        assertThat(after.getMembers())
                .extracting(SermonGroupResponse.Member::getUserId)
                .containsExactlyInAnyOrder(b, c);
    }

    @Test
    @DisplayName("혼자 남은 리더가 탈퇴하면 모임이 닫힌다")
    void soloLeaderClosesGroup() {
        String a = newUser("혼자");
        SermonGroupResponse.Detail g = groupService.create(a, groupRequest());

        userService.deleteAccount(a);

        Integer live = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sermon_groups WHERE id = ? AND deleted_at IS NULL", Integer.class, g.getId());
        assertThat(live).isZero();
    }

    private int count(String table, String userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId);
    }

    private void createNote(String userId) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("title", "포도나무와 가지");
        content.put("date", clock.today().toString());
        content.put("refs", List.of("42:15:1-5"));
        content.put("body", BODY_120);
        content.put("thoughts", List.of());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", content.get("title"));
        body.put("content", content);
        body.put("schema_ver", 1);
        docService.create(userId, "sermon", objectMapper.convertValue(body, PersonalFeatureDocRequest.Create.class));
    }

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("del-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }

    private static SermonGroupRequest.Create groupRequest() {
        SermonGroupRequest.Create req = new SermonGroupRequest.Create();
        req.setName("청년부 2셀");
        req.setKind("church");
        req.setJoinApproval(false);
        req.setDisplayName("리더");
        List<Map<String, Object>> services = new ArrayList<>();
        services.add(Map.of(
                "id",
                "sun",
                "name",
                "주일 설교",
                "active",
                true,
                "slots",
                List.of(Map.of("dow", 0, "start", "11:00", "end", "12:20"))));
        req.setServices(services);
        return req;
    }

    private static SermonGroupRequest.Join join(String name) {
        SermonGroupRequest.Join req = new SermonGroupRequest.Join();
        req.setDisplayName(name);
        req.setMutedServiceIds(List.of());
        return req;
    }
}
