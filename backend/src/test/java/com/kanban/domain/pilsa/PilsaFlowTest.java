package com.kanban.domain.pilsa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.pilsa.dto.PilsaDto;
import com.kanban.domain.pilsa.service.PilsaService;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentLedgerRepository;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.service.TalentWalletService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

/** 이번 주 말씀 필사 흐름 — test 프로파일(H2). 시각은 2026-10-28 수 12:00 KST 로 고정한다. */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("이번 주 말씀 필사 흐름")
class PilsaFlowTest {

    private static final Instant WED_NOON = Instant.parse("2026-10-28T03:00:00Z");
    private static final LocalDate WEEK = LocalDate.of(2026, 10, 26);

    @Autowired
    ChallengeClock clock;

    @Autowired
    PilsaService pilsaService;

    @Autowired
    TalentWalletService walletService;

    @Autowired
    TalentLedgerRepository ledgerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @BeforeEach
    void fixClock() {
        clock.useClock(Clock.fixed(WED_NOON, ZoneOffset.UTC));
    }

    @AfterEach
    void resetClock() {
        clock.useClock(null);
    }

    @Test
    @DisplayName("계획 없음 → PUT → GET 같은 일곱 장 · 두 번째 PUT 은 처음 것을 유지")
    void putThenGet() {
        String u = newUser();
        PilsaDto.Week empty = pilsaService.week(u);
        assertThat(empty.getWeek()).isEqualTo(WEEK);
        assertThat(empty.getEndsAt()).isEqualTo(Instant.parse("2026-11-01T13:00:00Z"));
        assertThat(empty.getChapters()).isEmpty();
        assertThat(empty.isWeekDone()).isFalse();

        PilsaDto.Week put = pilsaService.putWeek(u, put(WEEK, plan(44, 5, 3)));
        assertThat(put.getChapters()).hasSize(7);
        assertThat(put.getChapters().get(0).getB()).isEqualTo(44);
        assertThat(put.getChapters().get(0).getReason()).isEqualTo("main");
        assertThat(put.getChapters().get(0).getDone()).isEmpty();

        PilsaDto.Week got = pilsaService.week(u);
        assertThat(got.getChapters()).extracting(PilsaDto.Chapter::getC).containsExactly(5, 6, 7, 8, 9, 10, 11);

        // 다른 기기가 다른 계획을 보내도 먼저 온 것이 이긴다
        PilsaDto.Week second = pilsaService.putWeek(u, put(WEEK, plan(42, 1, 10)));
        assertThat(second.getChapters()).extracting(PilsaDto.Chapter::getB).containsOnly(44);
        assertThat(second.getChapters().get(0).getVerses()).isEqualTo(3);
    }

    @Test
    @DisplayName("JSON 은 계약서 필드 이름(snake_case) 그대로")
    void json() throws Exception {
        String u = newUser();
        pilsaService.putWeek(u, put(WEEK, plan(44, 5, 3)));
        String week = objectMapper.writeValueAsString(pilsaService.week(u));
        assertThat(week)
                .contains("\"week\":\"2026-10-26\"")
                .contains("\"ends_at\":\"2026-11-01T13:00:00Z\"")
                .contains("\"completed_chapters\":0")
                .contains("\"week_done\":false")
                .contains("{\"b\":44,\"c\":5,\"reason\":\"main\",\"verses\":3,\"done\":[]}");
        String verse = objectMapper.writeValueAsString(pilsaService.writeVerse(u, verse(44, 5, 1)));
        assertThat(verse)
                .isEqualTo("{\"b\":44,\"c\":5,\"done\":[1],\"chapter_done\":false,\"week_done\":false,\"awarded\":0}");
        PilsaDto.VerseIn in = objectMapper.readValue(
                "{\"week\":\"2026-10-26\",\"b\":44,\"c\":5,\"v\":2,\"chars\":31,\"ms\":14200}", PilsaDto.VerseIn.class);
        assertThat(in.getMs()).isEqualTo(14200L);
        assertThat(in.getWeek()).isEqualTo(WEEK);
    }

    @Test
    @DisplayName("PUT 검증 — 다른 주 PIL001, 6개·중복·범위 밖·reason PIL003")
    void putValidation() {
        String u = newUser();
        assertCode(
                () -> pilsaService.putWeek(u, put(WEEK.minusWeeks(1), plan(44, 5, 3))), ErrorCode.PILSA_NOT_THIS_WEEK);
        assertCode(() -> pilsaService.putWeek(u, put(null, plan(44, 5, 3))), ErrorCode.PILSA_NOT_THIS_WEEK);

        List<PilsaDto.ChapterIn> six = plan(44, 5, 3);
        six.remove(6);
        assertCode(() -> pilsaService.putWeek(u, put(WEEK, six)), ErrorCode.PILSA_INVALID);

        List<PilsaDto.ChapterIn> dup = plan(44, 5, 3);
        dup.set(6, new PilsaDto.ChapterIn(44, 5, "near", 3));
        assertCode(() -> pilsaService.putWeek(u, put(WEEK, dup)), ErrorCode.PILSA_INVALID);

        List<PilsaDto.ChapterIn> book = plan(44, 5, 3);
        book.set(6, new PilsaDto.ChapterIn(66, 1, "near", 3));
        assertCode(() -> pilsaService.putWeek(u, put(WEEK, book)), ErrorCode.PILSA_INVALID);

        List<PilsaDto.ChapterIn> verses = plan(44, 5, 3);
        verses.set(6, new PilsaDto.ChapterIn(44, 20, "near", 177));
        assertCode(() -> pilsaService.putWeek(u, put(WEEK, verses)), ErrorCode.PILSA_INVALID);

        List<PilsaDto.ChapterIn> reason = plan(44, 5, 3);
        reason.set(6, new PilsaDto.ChapterIn(44, 20, "random", 3));
        assertCode(() -> pilsaService.putWeek(u, put(WEEK, reason)), ErrorCode.PILSA_INVALID);

        assertThat(pilsaService.week(u).getChapters()).isEmpty();
    }

    @Test
    @DisplayName("절 검증 — 다른 주 PIL001, 계획 없음/없는 장 PIL002, 절 범위 PIL003, 너무 빠름 PIL004(422)")
    void verseValidation() {
        String u = newUser();
        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 1)), ErrorCode.PILSA_CHAPTER_NOT_IN_PLAN);

        pilsaService.putWeek(u, put(WEEK, plan(44, 5, 3)));
        PilsaDto.VerseIn wrongWeek = verse(44, 5, 1);
        wrongWeek.setWeek(WEEK.plusWeeks(1));
        assertCode(() -> pilsaService.writeVerse(u, wrongWeek), ErrorCode.PILSA_NOT_THIS_WEEK);

        assertCode(() -> pilsaService.writeVerse(u, verse(44, 4, 1)), ErrorCode.PILSA_CHAPTER_NOT_IN_PLAN);
        assertCode(() -> pilsaService.writeVerse(u, verse(43, 5, 1)), ErrorCode.PILSA_CHAPTER_NOT_IN_PLAN);
        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 0)), ErrorCode.PILSA_INVALID);
        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 4)), ErrorCode.PILSA_INVALID);

        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 1, 0, 5_000L)), ErrorCode.PILSA_TOO_FAST);
        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 1, 5, 599L)), ErrorCode.PILSA_TOO_FAST);
        // 1초에 16자
        assertCode(() -> pilsaService.writeVerse(u, verse(44, 5, 1, 16, 1_000L)), ErrorCode.PILSA_TOO_FAST);
        assertThat(ErrorCode.PILSA_TOO_FAST.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        // 1초에 15자 는 통과
        assertThat(pilsaService.writeVerse(u, verse(44, 5, 1, 15, 1_000L)).getDone())
                .containsExactly(1);
    }

    @Test
    @DisplayName("한 장을 다 쓰면 +5 한 번 · 다시 보내도 0 · 일곱 장을 다 쓰면 +20 · 주간 랭킹 달란트에 들어감")
    void awards() {
        String u = newUser();
        pilsaService.putWeek(u, put(WEEK, plan(44, 5, 3)));

        PilsaDto.VerseResult r = pilsaService.writeVerse(u, verse(44, 5, 3));
        assertThat(r.getDone()).containsExactly(3);
        assertThat(r.isChapterDone()).isFalse();
        assertThat(r.getAwarded()).isZero();
        pilsaService.writeVerse(u, verse(44, 5, 1));
        r = pilsaService.writeVerse(u, verse(44, 5, 2));
        assertThat(r.getDone()).containsExactly(1, 2, 3);
        assertThat(r.isChapterDone()).isTrue();
        assertThat(r.isWeekDone()).isFalse();
        assertThat(r.getAwarded()).isEqualTo(5);
        assertThat(balance(u)).isEqualTo(5);

        // 같은 절 다시 — 멱등, 적립 없음
        r = pilsaService.writeVerse(u, verse(44, 5, 2));
        assertThat(r.getAwarded()).isZero();
        assertThat(r.getDone()).containsExactly(1, 2, 3);
        assertThat(balance(u)).isEqualTo(5);

        PilsaDto.Week w = pilsaService.week(u);
        assertThat(w.getCompletedChapters()).isEqualTo(1);
        assertThat(w.getChapters().get(0).getDone()).containsExactly(1, 2, 3);

        // 나머지 여섯 장
        int lastAwarded = 0;
        for (int c = 6; c <= 11; c++) {
            for (int v = 1; v <= 3; v++) {
                r = pilsaService.writeVerse(u, verse(44, c, v));
                lastAwarded = r.getAwarded();
            }
        }
        assertThat(r.isChapterDone()).isTrue();
        assertThat(r.isWeekDone()).isTrue();
        assertThat(lastAwarded).isEqualTo(5 + 20);
        assertThat(balance(u)).isEqualTo(7 * 5 + 20);

        // 다시 보내도 더 주지 않는다
        r = pilsaService.writeVerse(u, verse(44, 11, 3));
        assertThat(r.getAwarded()).isZero();
        assertThat(r.isWeekDone()).isTrue();
        assertThat(balance(u)).isEqualTo(55);

        w = pilsaService.week(u);
        assertThat(w.getCompletedChapters()).isEqualTo(7);
        assertThat(w.isWeekDone()).isTrue();

        // 랭킹 달란트에 들어가고, 게임 하루 상한과 무관
        TalentDtoView view = view(u);
        assertThat(view.weekTalents).isEqualTo(55);
        assertThat(view.todayGame).isZero();
        assertThat(ledgerRepository.findByUserIdAndReason(u, TalentReason.PILSA))
                .hasSize(7);
        assertThat(ledgerRepository.findByUserIdAndReason(u, TalentReason.PILSA_WEEK))
                .singleElement()
                .satisfies(l -> {
                    assertThat(l.getAwardKey()).isEqualTo("pilsa_week:" + WEEK);
                    assertThat(l.getWeek()).isEqualTo(WEEK);
                    assertThat(l.isCountsForRank()).isTrue();
                });
        assertThat(ledgerRepository.findByUserIdAndAwardKeyOrderByAwardSeqAsc(u, "pilsa:" + WEEK + ":44:5"))
                .hasSize(1);
    }

    // ───────────────── helpers ─────────────────

    private record TalentDtoView(int weekTalents, int todayGame) {}

    private TalentDtoView view(String userId) {
        var w = walletService.wallet(userId);
        return new TalentDtoView(w.getWeekTalents(), w.getTodayGameTalents());
    }

    private String newUser() {
        return userRepository
                .save(User.builder()
                        .email("pilsa-" + UUID.randomUUID() + "@example.com")
                        .name("필사")
                        .build())
                .getId();
    }

    private int balance(String userId) {
        return walletService.wallet(userId).getBalance();
    }

    /** b 권 c..c+6 장, 각 verses 절 */
    private static List<PilsaDto.ChapterIn> plan(int b, int c, int verses) {
        List<PilsaDto.ChapterIn> out = new ArrayList<>();
        for (int i = 0; i < 7; i++) out.add(new PilsaDto.ChapterIn(b, c + i, i == 0 ? "main" : "near", verses));
        return out;
    }

    private static PilsaDto.PutWeek put(LocalDate week, List<PilsaDto.ChapterIn> chapters) {
        PilsaDto.PutWeek p = new PilsaDto.PutWeek();
        p.setWeek(week);
        p.setChapters(chapters);
        return p;
    }

    private static PilsaDto.VerseIn verse(int b, int c, int v) {
        return verse(b, c, v, 30, 14_000L);
    }

    private static PilsaDto.VerseIn verse(int b, int c, int v, int chars, Long ms) {
        PilsaDto.VerseIn r = new PilsaDto.VerseIn();
        r.setWeek(WEEK);
        r.setB(b);
        r.setC(c);
        r.setV(v);
        r.setChars(chars);
        r.setMs(ms);
        return r;
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(code);
    }
}
