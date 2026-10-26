package com.kanban.domain.sermonprofile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.sermonprofile.service.SermonProfileService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** 이름표의 자동 갈피 설정 (galpi_auto / galpi_service) */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 이름표 자동 갈피 설정")
class SermonProfileGalpiTest {

    @Autowired
    SermonProfileService profileService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    @DisplayName("기본값 true/null, 저장하면 그대로, galpi_auto 를 빼고 PUT 하면 바뀌지 않는다")
    void roundTrip() throws Exception {
        String me = newUser("갈피");
        SermonProfileDto.Profile empty = profileService.getMe(me);
        assertThat(empty.getGalpiAuto()).isTrue();
        assertThat(empty.getGalpiService()).isNull();

        SermonProfileDto.Update req = new SermonProfileDto.Update();
        req.setGalpiAuto(false);
        req.setGalpiService("  주일 2부  ");
        SermonProfileDto.Profile saved = profileService.putMe(me, req);
        assertThat(saved.getGalpiAuto()).isFalse();
        assertThat(saved.getGalpiService()).isEqualTo("주일 2부");

        // 옛 클라이언트 — 두 필드를 모른다 (galpi_service 만 와도 galpi_auto 가 없으면 무시)
        SermonProfileDto.Update old = new SermonProfileDto.Update();
        old.setInk("mint");
        old.setGalpiService("다른 예배");
        SermonProfileDto.Profile kept = profileService.putMe(me, old);
        assertThat(kept.getInk()).isEqualTo("mint");
        assertThat(kept.getGalpiAuto()).isFalse();
        assertThat(kept.getGalpiService()).isEqualTo("주일 2부");

        // 빈 문자열 → null
        SermonProfileDto.Update clear = new SermonProfileDto.Update();
        clear.setGalpiAuto(true);
        clear.setGalpiService("   ");
        SermonProfileDto.Profile cleared = profileService.putMe(me, clear);
        assertThat(cleared.getGalpiAuto()).isTrue();
        assertThat(cleared.getGalpiService()).isNull();

        // JSON 은 snake_case
        Map<String, Object> json = objectMapper.convertValue(
                saved, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        assertThat(json).containsEntry("galpi_auto", false).containsEntry("galpi_service", "주일 2부");
        SermonProfileDto.Update parsed = objectMapper.convertValue(
                Map.of("galpi_auto", true, "galpi_service", "새벽"), SermonProfileDto.Update.class);
        assertThat(parsed.getGalpiAuto()).isTrue();
        assertThat(parsed.getGalpiService()).isEqualTo("새벽");
    }

    @Test
    @DisplayName("처음 저장할 때 galpi_auto 를 빼면 응답은 true")
    void firstSaveWithoutField() {
        String me = newUser("처음");
        SermonProfileDto.Profile saved = profileService.putMe(me, new SermonProfileDto.Update());
        assertThat(saved.isSaved()).isTrue();
        assertThat(saved.getGalpiAuto()).isTrue();
        assertThat(saved.getGalpiService()).isNull();
    }

    @Test
    @DisplayName("60자 넘는 예배 이름은 SPF001, 다른 사람 조회엔 두 필드가 없다")
    void validationAndPrivacy() {
        String a = newUser("에이");
        String b = newUser("비");
        SermonProfileDto.Update bad = new SermonProfileDto.Update();
        bad.setGalpiAuto(true);
        bad.setGalpiService("가".repeat(61));
        assertThatThrownBy(() -> profileService.putMe(a, bad))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SERMON_PROFILE_INVALID_INPUT);

        SermonProfileDto.Update ok = new SermonProfileDto.Update();
        ok.setVisibility("link");
        ok.setGalpiAuto(false);
        ok.setGalpiService("가".repeat(60));
        profileService.putMe(a, ok);
        SermonProfileDto.Profile seen = profileService.getOther(b, a);
        assertThat(seen.getGalpiAuto()).isNull();
        assertThat(seen.getGalpiService()).isNull();
    }

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("galpi-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }
}
