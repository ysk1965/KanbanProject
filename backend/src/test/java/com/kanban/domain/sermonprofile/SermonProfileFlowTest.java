package com.kanban.domain.sermonprofile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kanban.domain.church.dto.ChurchDto;
import com.kanban.domain.church.service.ChurchService;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.sermonprofile.service.SermonProfileService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** 「나의 갈피」 이름표 — test 프로파일(H2)에서 저장·연대기·공개 범위·검증을 끝까지 돌린다. */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 나의 갈피 이름표")
class SermonProfileFlowTest {

    @Autowired
    SermonProfileService profileService;

    @Autowired
    SermonGroupService groupService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ChurchService churchService;

    @Test
    @DisplayName("처음엔 기본값, 저장하면 그대로 돌려주고 대표 말씀을 바꾸면 연대기가 쌓인다")
    void saveAndHistory() {
        String me = newUser("은혜");
        SermonProfileDto.Profile empty = profileService.getMe(me);
        assertThat(empty.isSaved()).isFalse();
        assertThat(empty.getMascot()).isEqualTo("galpi");
        assertThat(empty.getVisibility()).isEqualTo("groups");
        assertThat(empty.getDisplayName()).isEqualTo("은혜");

        SermonProfileDto.Update req = update("44:5:3-4");
        req.setPins(List.of(pin("n1", "dots"), pin("n2", "stars")));
        SermonProfileDto.Profile saved = profileService.putMe(me, req);
        assertThat(saved.isSaved()).isTrue();
        assertThat(saved.getChurch()).isNull();
        assertThat(saved.getPins()).extracting(SermonProfileDto.Pin::getNoteId).containsExactly("n1", "n2");
        assertThat(saved.getPins().get(1).getPattern()).isEqualTo("stars");
        assertThat(saved.getVerseCount()).isEqualTo(1L);

        // 같은 말씀으로 다시 저장 → 연대기 그대로, 다른 말씀 → 이전 행이 닫히고 새 행
        profileService.putMe(me, update("44:5:3-4"));
        SermonProfileDto.Profile changed = profileService.putMe(me, update("18:23:1-1"));
        assertThat(changed.getVerseCount()).isEqualTo(2L);
        assertThat(changed.getVerseHistory()).hasSize(2);
        assertThat(changed.getVerseHistory().get(0).getVerseRef()).isEqualTo("18:23:1-1");
        assertThat(changed.getVerseHistory().get(0).getToAt()).isNull();
        assertThat(changed.getVerseHistory().get(1).getToAt()).isNotNull();
        // 핀을 빼고 저장하면 비워진다 (통째로 교체)
        assertThat(changed.getPins()).isEmpty();
    }

    @Test
    @DisplayName("다른 사람: groups 는 같은 모임만, private 는 아무도, link 는 누구나 — 핀은 안 보인다")
    void visibility() {
        String a = newUser("에이");
        String b = newUser("비");
        String stranger = newUser("남");
        SermonProfileDto.Update req = update("44:5:3-4");
        req.setPins(List.of(pin("n1", "dots")));
        profileService.putMe(a, req);

        assertThatThrownBy(() -> profileService.getOther(b, a))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SERMON_PROFILE_NOT_VISIBLE);

        SermonGroupResponse.Detail g = groupService.create(a, groupRequest());
        groupService.join(b, g.getInviteCode(), join("비"));
        SermonProfileDto.Profile seen = profileService.getOther(b, a);
        assertThat(seen.getVerseRef()).isEqualTo("44:5:3-4");
        assertThat(seen.getPins()).isNull();
        assertThat(seen.getVerseHistory()).isNull();
        assertThatThrownBy(() -> profileService.getOther(stranger, a)).isInstanceOf(BusinessException.class);

        req.setVisibility("private");
        profileService.putMe(a, req);
        assertThatThrownBy(() -> profileService.getOther(b, a)).isInstanceOf(BusinessException.class);

        req.setVisibility("link");
        profileService.putMe(a, req);
        assertThat(profileService.getOther(stranger, a).getUserId()).isEqualTo(a);
    }

    @Test
    @DisplayName("검증: 4절 이상·장 전체·잘못된 값·핀 4개·핀 중복·한 줄 40자 초과는 SPF001")
    void validation() {
        String me = newUser("검증");
        for (String bad : List.of("44:5:1-4", "44:5:1-20w", "70:1:1-1", "로마서 5:3", "44:5:3-2")) {
            assertInvalid(me, update(bad));
        }
        SermonProfileDto.Update badInk = update(null);
        badInk.setInk("rainbow");
        assertInvalid(me, badInk);

        SermonProfileDto.Update many = update(null);
        many.setPins(List.of(pin("a", "dots"), pin("b", "dots"), pin("c", "dots"), pin("d", "dots")));
        assertInvalid(me, many);

        SermonProfileDto.Update dup = update(null);
        dup.setPins(List.of(pin("a", "dots"), pin("a", "lines")));
        assertInvalid(me, dup);

        SermonProfileDto.Update longLine = update(null);
        SermonProfileDto.Pin p = pin("a", "dots");
        p.setLine("가".repeat(41));
        longLine.setPins(List.of(p));
        assertInvalid(me, longLine);

        // 대표 말씀 비우기는 된다
        assertThat(profileService.putMe(me, update("")).getVerseRef()).isNull();
    }

    @Test
    @DisplayName("소속 교회는 챌린지 user_churches 를 읽어 본인·모임 사람 이름표에 같이 나온다")
    void churchFromChallenge() {
        String a = newUser("에이");
        String b = newUser("비");
        profileService.putMe(a, update(null));
        ChurchDto.Register reg = new ChurchDto.Register();
        reg.setName("갈피테스트교회" + UUID.randomUUID().toString().substring(0, 6));
        reg.setRegion("서울 강남구");
        String churchId = churchService.register(a, reg).church().getId();
        churchService.setMine(a, churchId, "청년부");

        SermonProfileDto.Profile mine = profileService.getMe(a);
        assertThat(mine.getChurch().getId()).isEqualTo(churchId);
        assertThat(mine.getChurch().getDept()).isEqualTo("청년부");
        assertThat(mine.getChurch().getRegion()).isEqualTo("서울 강남구");

        SermonGroupResponse.Detail g = groupService.create(a, groupRequest());
        groupService.join(b, g.getInviteCode(), join("비"));
        assertThat(profileService.getOther(b, a).getChurch().getName()).startsWith("갈피테스트교회");
    }

    private void assertInvalid(String me, SermonProfileDto.Update req) {
        assertThatThrownBy(() -> profileService.putMe(me, req))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SERMON_PROFILE_INVALID_INPUT);
    }

    private static SermonProfileDto.Update update(String verseRef) {
        SermonProfileDto.Update req = new SermonProfileDto.Update();
        req.setMascot("bang");
        req.setInk("mint");
        req.setVerseRef(verseRef);
        req.setVerseStyle("hand");
        return req;
    }

    private static SermonProfileDto.Pin pin(String noteId, String pattern) {
        return SermonProfileDto.Pin.builder()
                .noteId(noteId)
                .ink("peach")
                .pattern(pattern)
                .sticker("mascot")
                .line("버티는 게 아니라")
                .build();
    }

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("spf-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }

    private static SermonGroupRequest.Create groupRequest() {
        SermonGroupRequest.Create req = new SermonGroupRequest.Create();
        req.setName("청년부 2셀");
        req.setKind("church");
        req.setJoinApproval(false);
        req.setDisplayName("에이");
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
