package com.kanban.domain.sermonhighlight;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kanban.domain.sermonhighlight.dto.SermonHighlightDto;
import com.kanban.domain.sermonhighlight.service.SermonHighlightService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** 성경 읽기 형광펜 — test 프로파일(H2)에서 upsert·소프트 삭제·남의 것·검증을 돌린다. */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 성경 읽기 형광펜")
class SermonHighlightFlowTest {

    @Autowired
    SermonHighlightService service;

    @Test
    @DisplayName("PUT 은 만들고 고치고, DELETE 후엔 목록에서 빠지며 늦은 PUT 이 되살리지 않는다")
    void upsertAndDelete() {
        String me = uid();
        String id = uid();
        SermonHighlightDto.Item made = service.upsert(me, id, req(18, 51, 10, 10, r -> r.setColor("yellow")));
        assertThat(made.getColor()).isEqualTo("yellow");
        assertThat(made.isDeleted()).isFalse();

        SermonHighlightDto.Item edited = service.upsert(me, id, req(18, 51, 10, 10, r -> {
            r.setColor("pink");
            r.setMemo("  정한 마음  ");
            r.setCharStart(0);
            r.setCharEnd(12);
        }));
        assertThat(edited.getColor()).isEqualTo("pink");
        assertThat(edited.getMemo()).isEqualTo("정한 마음");
        assertThat(edited.getCharStart()).isNull(); // 0 = 절 처음부터
        assertThat(edited.getCharEnd()).isEqualTo(12);
        assertThat(service.list(me)).extracting(SermonHighlightDto.Item::getId).containsExactly(id);

        service.delete(me, id);
        service.delete(me, id); // 멱등
        service.delete(me, uid()); // 올리기 전에 지운 것
        assertThat(service.list(me)).isEmpty();
        SermonHighlightDto.Item late = service.upsert(me, id, req(18, 51, 10, 10, r -> r.setColor("blue")));
        assertThat(late.isDeleted()).isTrue();
        assertThat(service.list(me)).isEmpty();
    }

    @Test
    @DisplayName("남의 형광펜 id 는 없는 것처럼 404, 목록은 각자")
    void othersHidden() {
        String a = uid();
        String b = uid();
        String id = uid();
        service.upsert(a, id, req(44, 5, 12, 12, r -> r.setUnderline(true)));
        assertCode(
                () -> service.upsert(b, id, req(44, 5, 12, 12, r -> r.setColor("green"))),
                ErrorCode.SERMON_HIGHLIGHT_NOT_FOUND);
        assertCode(() -> service.delete(b, id), ErrorCode.SERMON_HIGHLIGHT_NOT_FOUND);
        assertThat(service.list(b)).isEmpty();
        assertThat(service.list(a)).hasSize(1);
    }

    @Test
    @DisplayName("범위·색·메모 검증 — 표시가 하나도 없으면 거절")
    void validation() {
        String me = uid();
        assertInvalid(me, uid(), req(66, 1, 1, 1, r -> r.setColor("yellow")));
        assertInvalid(me, uid(), req(18, 0, 1, 1, r -> r.setColor("yellow")));
        assertInvalid(me, uid(), req(18, 51, 5, 4, r -> r.setColor("yellow")));
        assertInvalid(me, uid(), req(18, 51, 1, 40, r -> r.setColor("yellow")));
        assertInvalid(me, uid(), req(18, 51, 1, 1, r -> r.setColor("red")));
        assertInvalid(me, uid(), req(18, 51, 1, 1, r -> {}));
        assertInvalid(me, uid(), req(18, 51, 1, 1, r -> r.setMemo("가".repeat(201))));
        assertInvalid(me, uid(), req(18, 51, 1, 1, r -> {
            r.setColor("yellow");
            r.setCharStart(8);
            r.setCharEnd(8);
        }));
        assertInvalid(me, "bad id!", req(18, 51, 1, 1, r -> r.setColor("yellow")));
        // 여러 절 — 끝 글자가 시작보다 앞이어도 다른 절이면 된다
        SermonHighlightDto.Item multi = service.upsert(me, uid(), req(18, 51, 10, 12, r -> {
            r.setColor("green");
            r.setCharStart(8);
            r.setCharEnd(3);
        }));
        assertThat(multi.getVerseTo()).isEqualTo(12);
    }

    private static SermonHighlightDto.Upsert req(int b, int c, int v1, int v2, Consumer<SermonHighlightDto.Upsert> f) {
        SermonHighlightDto.Upsert r = new SermonHighlightDto.Upsert();
        r.setBook(b);
        r.setChapter(c);
        r.setVerseFrom(v1);
        r.setVerseTo(v2);
        f.accept(r);
        return r;
    }

    private void assertInvalid(String me, String id, SermonHighlightDto.Upsert r) {
        assertCode(() -> service.upsert(me, id, r), ErrorCode.SERMON_HIGHLIGHT_INVALID_INPUT);
    }

    private static void assertCode(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(code);
    }

    private static String uid() {
        return UUID.randomUUID().toString();
    }
}
