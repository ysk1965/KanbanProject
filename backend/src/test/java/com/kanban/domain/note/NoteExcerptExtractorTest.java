package com.kanban.domain.note;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("NoteExcerptExtractor — 평문 추출 / search_text 생성")
class NoteExcerptExtractorTest {

    private static final String BLOCKNOTE = """
            [
              {"type":"heading","content":[{"type":"text","text":"Release Plan"}],
               "children":[{"type":"paragraph","content":[{"type":"text","text":"nested child"}]}]},
              {"type":"paragraph","content":[{"type":"text","text":"Ship   on Friday"},{"type":"text","text":"!"}]}
            ]
            """;

    @Test
    @DisplayName("BlockNote JSON: content/children 의 text 런을 순서대로 모은다")
    void toPlainText_blockNote() {
        assertThat(NoteExcerptExtractor.toPlainText(BLOCKNOTE))
                .isEqualTo("Release Plan nested child Ship on Friday !");
    }

    @Test
    @DisplayName("레거시 HTML: 태그 제거 + 엔티티 복원")
    void toPlainText_html() {
        assertThat(NoteExcerptExtractor.toPlainText("<p>Hello&nbsp;<b>world</b> &amp; friends</p>"))
                .isEqualTo("Hello world & friends");
    }

    @Test
    @DisplayName("화이트보드 JSON / 빈 본문 / 깨진 JSON 은 null")
    void toPlainText_unsupported() {
        assertThat(NoteExcerptExtractor.toPlainText("{\"shapes\":[]}")).isNull();
        assertThat(NoteExcerptExtractor.toPlainText("   ")).isNull();
        assertThat(NoteExcerptExtractor.toPlainText(null)).isNull();
        assertThat(NoteExcerptExtractor.toPlainText("[{\"type\":")).isNull();
    }

    @Test
    @DisplayName("toPlainText 는 길이 제한이 없다 (extract 의 180자 캡과 별개)")
    void toPlainText_noTruncation() {
        String longText = "x".repeat(2_000);
        String json = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"" + longText + "\"}]}]";
        assertThat(NoteExcerptExtractor.toPlainText(json)).hasSize(2_000);
        assertThat(NoteExcerptExtractor.extract(json, NoteType.DOCUMENT)).hasSize(181).endsWith("…");
    }

    @Test
    @DisplayName("search_text = lowercase(title \\n plainText) — DOCUMENT")
    void buildSearchText_document() {
        assertThat(NoteExcerptExtractor.buildSearchText("My TITLE", BLOCKNOTE, NoteType.DOCUMENT))
                .isEqualTo("my title\nrelease plan nested child ship on friday !");
    }

    @Test
    @DisplayName("폴더·화이트보드는 제목만 (본문 무시)")
    void buildSearchText_titleOnly() {
        assertThat(NoteExcerptExtractor.buildSearchText("Folder A", null, NoteType.FOLDER)).isEqualTo("folder a");
        assertThat(NoteExcerptExtractor.buildSearchText("Board", "{\"shapes\":[]}", NoteType.BOARD)).isEqualTo("board");
        assertThat(NoteExcerptExtractor.buildSearchText("Doc", "{\"shapes\":[]}", NoteType.DOCUMENT)).isEqualTo("doc");
    }

    @Test
    @DisplayName("절대 null 이 아니고 200_000자에서 잘린다")
    void buildSearchText_neverNullAndCapped() {
        assertThat(NoteExcerptExtractor.buildSearchText(null, null, NoteType.DOCUMENT)).isEqualTo("");

        String huge = "a".repeat(NoteExcerptExtractor.SEARCH_TEXT_MAX_LEN + 500);
        String json = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"" + huge + "\"}]}]";
        assertThat(NoteExcerptExtractor.buildSearchText("t", json, NoteType.DOCUMENT))
                .hasSize(NoteExcerptExtractor.SEARCH_TEXT_MAX_LEN);
    }
}
