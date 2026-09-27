package com.kanban.domain.personal.feature;

import com.kanban.domain.personal.feature.dto.PersonalFeatureDocSummaryRow;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.config.JpaConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 「기능」 탭 문서 리포지토리 — JSON 컬럼이 H2에서 매핑되고, 목록 프로젝션 JPQL이 파싱되는지 확인한다.
 *
 * <p>content는 방언에 맡긴 JSON 타입이라 columnDefinition 없이 H2(json) · PostgreSQL(jsonb)
 * 양쪽에서 동작해야 한다. 여기서는 H2 쪽을 한 번 실제로 저장·조회한다.</p>
 */
@DataJpaTest
@ActiveProfiles("local")
@Import(JpaConfig.class) // created_at 은 JPA Auditing 이 채운다
@DisplayName("기능 탭 문서 리포지토리")
class PersonalFeatureDocRepositoryQueryTest {

    @Autowired
    private PersonalFeatureDocRepository docRepository;

    @Autowired
    private PersonalFeatureTermRepository termRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("JSON content를 저장하고 목록 프로젝션으로 읽는다 (삭제된 문서는 빠진다)")
    void saveJsonAndListSummaries() {
        User user = userRepository.save(User.builder()
                .email("pfd-test@example.com").name("pfd").build());

        PersonalFeatureDoc live = docRepository.save(PersonalFeatureDoc.builder()
                .user(user).featureKey("timetable").title("9/12 리허설")
                .content(Map.of("version_label", "v1", "columns", List.of(Map.of("key", "c1", "label", "장소"))))
                .build());
        PersonalFeatureDoc gone = docRepository.save(PersonalFeatureDoc.builder()
                .user(user).featureKey("timetable").title("지운 것").content(Map.of()).build());
        gone.softDelete();
        docRepository.flush();

        List<PersonalFeatureDocSummaryRow> rows = docRepository.findSummaries(user.getId(), "timetable");
        assertThat(rows).extracting(PersonalFeatureDocSummaryRow::id).containsExactly(live.getId());
        assertThat(docRepository.countLive(user.getId(), "timetable")).isEqualTo(1);

        PersonalFeatureDoc reloaded = docRepository.findById(live.getId()).orElseThrow();
        assertThat(reloaded.getContent()).containsEntry("version_label", "v1");
        assertThat(reloaded.getContent().get("columns")).isInstanceOf(List.class);
    }

    @Test
    @DisplayName("소프트 삭제 30일 경과 문서만 하드 삭제된다")
    void purgeOnlyOldSoftDeleted() {
        User user = userRepository.save(User.builder()
                .email("pfd-purge@example.com").name("pfd").build());
        PersonalFeatureDoc old = docRepository.save(PersonalFeatureDoc.builder()
                .user(user).featureKey("timetable").title("old").content(Map.of())
                .deletedAt(LocalDateTime.now(ZoneOffset.UTC).minusDays(31)).build());
        PersonalFeatureDoc recent = docRepository.save(PersonalFeatureDoc.builder()
                .user(user).featureKey("timetable").title("recent").content(Map.of())
                .deletedAt(LocalDateTime.now(ZoneOffset.UTC).minusDays(1)).build());
        docRepository.flush();

        int purged = docRepository.deleteSoftDeletedBefore(LocalDateTime.now(ZoneOffset.UTC).minusDays(30));

        assertThat(purged).isEqualTo(1);
        assertThat(docRepository.existsById(old.getId())).isFalse();
        assertThat(docRepository.existsById(recent.getId())).isTrue();
    }

    @Test
    @DisplayName("추천 용어 파생 쿼리가 파싱된다")
    void termDerivedQueriesParse() {
        termRepository.save(PersonalFeatureTerm.builder()
                .userId("u1").featureKey("timetable").field("장소").value("아트스튜디오").color("red").build());
        termRepository.flush();

        assertThat(termRepository.findByUserIdAndFeatureKeyAndFieldAndValue("u1", "timetable", "장소", "아트스튜디오"))
                .isPresent();
        assertThat(termRepository.findByUserIdAndFeatureKeyAndFieldOrderByUseCountDescLastUsedAtDesc("u1", "timetable", "장소"))
                .hasSize(1);
        assertThat(termRepository.findByUserIdAndFeatureKeyOrderByFieldAscUseCountDescLastUsedAtDesc("u1", "timetable"))
                .hasSize(1);
        termRepository.deleteByUserIdAndFeatureKeyAndFieldAndValue("u1", "timetable", "장소", "아트스튜디오");
        assertThat(termRepository.findAll()).isEmpty();
    }
}
