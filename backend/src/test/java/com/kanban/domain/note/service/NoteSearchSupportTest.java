package com.kanban.domain.note.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("NoteSearchSupport — 질의 정규화 / LIKE 패턴 / 스니펫")
class NoteSearchSupportTest {

    @Test
    void normalizeQuery_trimsLowercasesAndRejectsShort() {
        assertThat(NoteSearchSupport.normalizeQuery("  ReLease ")).isEqualTo("release");
        assertThat(NoteSearchSupport.normalizeQuery(" a ")).isNull();
        assertThat(NoteSearchSupport.normalizeQuery(null)).isNull();
        assertThat(NoteSearchSupport.normalizeQuery("ab")).isEqualTo("ab");
    }

    @Test
    void likePattern_escapesWildcards() {
        assertThat(NoteSearchSupport.likePattern("50% off_now!")).isEqualTo("%50!% off!_now!!%");
    }

    @Test
    void snippet_centersOnMatchAndMarksCuts() {
        String text = "w ".repeat(100) + "NEEDLE" + " z".repeat(100);
        String out = NoteSearchSupport.snippet(text, text.indexOf("NEEDLE"), 6);
        assertThat(out).contains("NEEDLE").startsWith("…").endsWith("…");
        assertThat(out.length()).isLessThanOrEqualTo(NoteSearchSupport.EXCERPT_LEN + 2);
    }

    @Test
    void snippet_noMatchTakesHead_shortTextReturnedAsIs() {
        String longText = "abc ".repeat(100);
        assertThat(NoteSearchSupport.snippet(longText, -1, 3)).doesNotStartWith("…").endsWith("…");
        assertThat(NoteSearchSupport.snippet("short text", -1, 3)).isEqualTo("short text");
        assertThat(NoteSearchSupport.snippet(null, -1, 3)).isNull();
    }
}
