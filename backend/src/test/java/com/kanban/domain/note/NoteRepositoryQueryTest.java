package com.kanban.domain.note;

import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.config.JpaConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 노트 검색/백필/기여자 JPQL 이 H2 에서 파싱·실행되고, 새 컬럼(search_text, status, note_versions.note)이
 * 엔티티 매핑과 맞는지 확인한다. 개인(owner) 스코프로 실제 데이터를 넣어 검색 동작까지 본다.
 */
@DataJpaTest
@Import(JpaConfig.class) // users.created_at 은 JPA Auditing 이 채운다
@ActiveProfiles("local")
@DisplayName("노트 검색·기여자 JPQL")
class NoteRepositoryQueryTest {

    @Autowired NoteRepository noteRepository;
    @Autowired NoteVersionRepository noteVersionRepository;
    @Autowired UserRepository userRepository;

    private static final String DOC = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Quarterly ROADMAP review notes\"}]}]";

    private User user(String email) {
        return userRepository.save(User.builder().email(email).name("U " + email).build());
    }

    private Note note(User owner, NoteType type, String title, String content, NoteStatus status) {
        Note n = Note.builder().owner(owner).type(type).title(title).content(content)
                .createdBy(owner).updatedBy(owner).status(status).build();
        return noteRepository.save(n);
    }

    @Test
    @DisplayName("제목 또는 search_text 로 매치, 폴더 제외, LIKE 이스케이프 동작")
    void searchByOwner_matchesTitleOrBody_excludesFolders() {
        User me = user("me@test.dev");
        User other = user("other@test.dev");
        note(me, NoteType.FOLDER, "roadmap folder", null, null);
        Note byBody = note(me, NoteType.DOCUMENT, "Plain title", DOC, NoteStatus.IN_REVIEW);
        Note byTitle = note(me, NoteType.DOCUMENT, "Roadmap 2027", "[]", null);
        note(me, NoteType.DOCUMENT, "50% done", "[]", null);
        note(other, NoteType.DOCUMENT, "roadmap of someone else", "[]", null);

        assertThat(byBody.getSearchText()).isEqualTo("plain title\nquarterly roadmap review notes");

        List<Note> hits = noteRepository.searchByOwnerUserId(me.getId(), "%roadmap%", PageRequest.of(0, 30));
        assertThat(hits).extracting(Note::getId).containsExactlyInAnyOrder(byBody.getId(), byTitle.getId());

        // '%' 를 이스케이프하면 리터럴 매치만
        assertThat(noteRepository.searchByOwnerUserId(me.getId(), "%50!%%", PageRequest.of(0, 30)))
                .extracting(Note::getTitle).containsExactly("50% done");
        assertThat(noteRepository.searchByOwnerUserId(me.getId(), "%50!%x%", PageRequest.of(0, 30))).isEmpty();
    }

    @Test
    @DisplayName("보드/조직 스코프 검색 쿼리도 파싱된다")
    void boardAndOrgSearchParse() {
        assertThat(noteRepository.searchByBoardId("nope", "%x%", PageRequest.of(0, 30))).isEmpty();
        assertThat(noteRepository.searchByOrganizationId("nope", "%x%", PageRequest.of(0, 30))).isEmpty();
    }

    @Test
    @DisplayName("search_text 백필 조회: prePersist 가 채우므로 새 행은 대상이 아니다")
    void backfillQueries() {
        User me = user("bf@test.dev");
        note(me, NoteType.DOCUMENT, "t", DOC, null);
        assertThat(noteRepository.countBySearchTextIsNull()).isZero();
        assertThat(noteRepository.findBySearchTextIsNull(PageRequest.of(0, 200))).isEmpty();
    }

    @Test
    @DisplayName("버전 작성자 distinct + 최신순, 메모(note 컬럼) 저장")
    void versionAuthorsOrderedByLatest() {
        User a = user("a@test.dev");
        User b = user("b@test.dev");
        Note n = note(a, NoteType.DOCUMENT, "versioned", DOC, null);
        noteVersionRepository.save(NoteVersion.create(n, "v1", "[]", a, 1, "first"));
        noteVersionRepository.save(NoteVersion.create(n, "v2", "[]", b, 2, null));
        noteVersionRepository.save(NoteVersion.create(n, "v3", "[]", a, 3, "  "));

        List<Object[]> rows = noteVersionRepository.findDistinctAuthorIdsByNoteIdOrderByLatest(n.getId(), PageRequest.of(0, 20));
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)[0]).isEqualTo(a.getId()); // a 가 v3 로 가장 최근
        assertThat(rows.get(1)[0]).isEqualTo(b.getId());

        List<NoteVersion> versions = noteVersionRepository.findAllByNoteIdOrderByVersionNumberDesc(n.getId());
        assertThat(versions).extracting(NoteVersion::getMemo).containsExactly(null, null, "first");
    }
}
