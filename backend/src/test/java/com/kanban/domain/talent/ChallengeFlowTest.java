package com.kanban.domain.talent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.church.dto.ChurchDto;
import com.kanban.domain.church.service.ChurchService;
import com.kanban.domain.game.dto.GameDto;
import com.kanban.domain.game.service.GameService;
import com.kanban.domain.game.service.RainScorer;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocResponse;
import com.kanban.domain.personal.feature.service.PersonalFeatureDocService;
import com.kanban.domain.ranking.RankingProfile;
import com.kanban.domain.ranking.RankingProfileRepository;
import com.kanban.domain.ranking.WeeklyScoreRepository;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.ranking.service.LeagueService;
import com.kanban.domain.ranking.service.RankingProfileService;
import com.kanban.domain.ranking.service.RankingProfileSupport;
import com.kanban.domain.ranking.service.RankingService;
import com.kanban.domain.talent.dto.TalentDto;
import com.kanban.domain.talent.service.TalentLedgerService;
import com.kanban.domain.talent.service.TalentWalletService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 설교 노트 챌린지 핵심 흐름 — test 프로파일(H2)에서 서비스를 실제 저장소로 끝까지 돌린다.
 *
 * <p>테스트마다 새 사용자를 만든다. 시각은 {@link ChallengeClock#useClock} 으로 고정한다(기본: 2026-10-28 수 12:00 KST).
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 챌린지 흐름")
class ChallengeFlowTest {

    private static final Instant WED_NOON = Instant.parse("2026-10-28T03:00:00Z");
    private static final LocalDate WEEK = LocalDate.of(2026, 10, 26);
    private static final String BODY_120 = "<p>" + "말씀".repeat(30) + "</p><p>" + "은혜".repeat(30) + "</p>";

    @Autowired
    ChallengeClock clock;

    @Autowired
    PersonalFeatureDocService docService;

    @Autowired
    TalentWalletService walletService;

    @Autowired
    TalentLedgerService ledgerService;

    @Autowired
    GameService gameService;

    @Autowired
    ChurchService churchService;

    @Autowired
    RankingProfileService profileService;

    @Autowired
    RankingProfileSupport profileSupport;

    @Autowired
    RankingProfileRepository profileRepository;

    @Autowired
    RankingService rankingService;

    @Autowired
    LeagueService leagueService;

    @Autowired
    WeeklyScoreRepository weeklyScoreRepository;

    @Autowired
    TalentLedgerRepository ledgerRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    PlatformTransactionManager transactionManager;

    @BeforeEach
    void fixClock() {
        at(WED_NOON);
    }

    @AfterEach
    void resetClock() {
        clock.useClock(null);
    }

    // ───────────────── 적립 규칙 ─────────────────

    @Test
    @DisplayName(
            "노트 적립 → 같은 내용 재저장은 중복 없음 → 적용 2개 상한 → 실천 12시간 → 완주 → 체크 해제 상쇄 → 재적립 → 갈피는 적립 없음(예전 갈피는 유지) → 삭제 전부 상쇄")
    void noteLifecycle() {
        String u = newUser();
        Map<String, Object> note = note("2026-10-25", BODY_120);
        String docId = create(u, note).getId();
        assertThat(balance(u)).isEqualTo(20);
        assertThat(weekTalents(u)).isEqualTo(20);

        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(20);

        long at = WED_NOON.toEpochMilli() - Duration.ofHours(30).toMillis();
        List<Map<String, Object>> thoughts = new ArrayList<>();
        thoughts.add(thought("t1", "적용", "오늘 한 사람에게 먼저 연락하기", false, null, at));
        thoughts.add(thought("t2", "적용", "매일 아침 십 분 말씀 읽기", false, null, at));
        thoughts.add(thought("t3", "적용", "감사 제목 세 가지 적어 보기", false, null, at));
        thoughts.add(thought("t4", "적용", "짧다", false, null, at));
        note.put("thoughts", thoughts);
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(20 + 3 + 3); // 노트당 적용 2개

        // 실천 체크 — 11시간 뒤는 인정 안 됨
        thoughts.set(
                0,
                thought(
                        "t1",
                        "적용",
                        "오늘 한 사람에게 먼저 연락하기",
                        true,
                        at + Duration.ofHours(11).toMillis(),
                        at));
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(26);

        // 13시간 뒤 → +10, 이번 주 note + apply_done → 완주 +20
        thoughts.set(
                0,
                thought(
                        "t1",
                        "적용",
                        "오늘 한 사람에게 먼저 연락하기",
                        true,
                        at + Duration.ofHours(13).toMillis(),
                        at));
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(26 + 10 + 20);
        TalentDto.Wallet w = walletService.wallet(u);
        assertThat(w.getWeekComplete().isNote()).isTrue();
        assertThat(w.getWeekComplete().isApplyDone()).isTrue();
        assertThat(w.getWeekComplete().isDone()).isTrue();

        // 체크 해제 → 실천·완주 상쇄
        thoughts.set(0, thought("t1", "적용", "오늘 한 사람에게 먼저 연락하기", false, null, at));
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(26);

        // 다시 체크 → 재적립 (seq 2)
        thoughts.set(
                0,
                thought(
                        "t1",
                        "적용",
                        "오늘 한 사람에게 먼저 연락하기",
                        true,
                        at + Duration.ofHours(20).toMillis(),
                        at));
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(56);
        assertThat(ledgerRepository.findByUserIdAndAwardKeyOrderByAwardSeqAsc(u, "done:" + docId + ":t1"))
                .extracting(TalentLedger::getAmount)
                .containsExactly(10, -10, 10);

        // 갈피는 달란트 없음 — 뺀 주(0)도, 직접 꽂아도
        note.put("bookmarked_at", 0L);
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(56);
        note.put("bookmarked_at", WED_NOON.toEpochMilli());
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(56);

        // 폐지 전에 받은 갈피 +5 는 다시 저장해도 상쇄하지 않는다 (삭제 때만)
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(tx -> ledgerService.award(
                        ledgerService.lockWallet(u),
                        TalentLedgerService.Award.builder()
                                .userId(u)
                                .reason(TalentReason.GALPI)
                                .key("galpi:2026-10-25")
                                .amount(5)
                                .sourceId(docId)
                                .label("갈피")
                                .week(clock.currentWeek())
                                .countsForRank(true)
                                .build()));
        note.put("bookmarked_at", null);
        patch(u, docId, note);
        assertThat(balance(u)).isEqualTo(61);

        // 삭제 → 모두 상쇄
        docService.delete(u, "sermon", docId);
        assertThat(balance(u)).isZero();
        assertThat(weekTalents(u)).isZero();
        assertThat(walletService.ledger(u, null, 100).getItems()).hasSizeGreaterThan(10);
    }

    @Test
    @DisplayName("노트는 주 3편 상한, 14일 넘게 지난 노트는 적립 없음, 상한으로 못 받은 노트는 다른 노트가 빠지면 다음 저장 때 받는다")
    void noteCapAndAge() {
        String u = newUser();
        assertThat(balanceAfterCreate(u, note("2026-10-01", BODY_120))).isZero(); // 27일 전
        String a = create(u, note("2026-10-25", BODY_120)).getId();
        create(u, note("2026-10-26", BODY_120));
        create(u, note("2026-10-27", BODY_120));
        Map<String, Object> fourth = note("2026-10-28", BODY_120);
        String d = create(u, fourth).getId();
        assertThat(balance(u)).isEqualTo(60);

        docService.delete(u, "sermon", a);
        assertThat(balance(u)).isEqualTo(40);
        patch(u, d, fourth);
        assertThat(balance(u)).isEqualTo(60);
    }

    @Test
    @DisplayName("녹음 10분 이상이면 노트 인정, 올라간 토막이 있으면 녹음 +5")
    void audio() {
        String u = newUser();
        Map<String, Object> n = note("2026-10-25", "<p>짧은 본문</p>");
        n.put(
                "audio",
                Map.of(
                        "segments",
                        List.of(
                                Map.of("id", "local-abc", "duration", 300, "offset", 0),
                                Map.of("id", "file-123", "duration", 301, "offset", 300))));
        create(u, n);
        assertThat(balance(u)).isEqualTo(25);

        String u2 = newUser();
        Map<String, Object> n2 = note("2026-10-25", "<p>짧은 본문</p>");
        n2.put("audio", Map.of("segments", List.of(Map.of("id", "local-abc", "duration", 700, "offset", 0))));
        create(u2, n2);
        assertThat(balance(u2)).isEqualTo(20); // 올라간 토막 없음
    }

    @Test
    @DisplayName("4주 연속 노트 → 연속 보너스 +50 (랭킹 점수에는 안 들어감)")
    void streak() {
        String u = newUser();
        for (int k = 3; k >= 0; k--) {
            Instant t = WED_NOON.minus(Duration.ofDays(7L * k));
            at(t);
            create(u, note(ChallengeClock.dayOf(t).toString(), BODY_120));
        }
        assertThat(balance(u)).isEqualTo(4 * 20 + 50);
        assertThat(weekTalents(u)).isEqualTo(20);
        TalentDto.Wallet w = walletService.wallet(u);
        assertThat(w.getStreakWeeks()).isEqualTo(4);
        assertThat(w.getBestStreak()).isEqualTo(4);
    }

    // ───────────────── 교환 ─────────────────

    @Test
    @DisplayName("교환: 50달란트 = 리워드 1, 만료 다음 달 말 KST, 월 20 상한(CH004), 잔액 부족(CH003)")
    void exchange() {
        String u = newUser();
        grant(u, 1200);
        TalentDto.Wallet w = walletService.exchange(u, 2);
        assertThat(w.getBalance()).isEqualTo(1100);
        assertThat(w.getRewardCredits()).isEqualTo(2);
        assertThat(w.getRewardExpiresAt()).isEqualTo(Instant.parse("2026-11-30T14:59:59Z"));
        assertThat(w.getExchangedThisMonth()).isEqualTo(2);
        assertThat(w.getPersonalCreditsAvailable()).isEqualTo(32);

        assertCode(() -> walletService.exchange(u, 19), ErrorCode.TALENT_EXCHANGE_LIMIT);
        walletService.exchange(u, 18);
        assertCode(() -> walletService.exchange(u, 1), ErrorCode.TALENT_EXCHANGE_LIMIT);

        String poor = newUser();
        grant(poor, 49);
        assertCode(() -> walletService.exchange(poor, 1), ErrorCode.TALENT_INSUFFICIENT);
        assertCode(() -> walletService.exchange(poor, 0), ErrorCode.CHALLENGE_INVALID_INPUT);

        // 교환은 랭킹 점수에서 빠지지 않는다
        assertThat(weekTalents(u)).isEqualTo(1200);
    }

    // ───────────────── 게임 ─────────────────

    @Test
    @DisplayName("산성비: 서버 재계산 점수 · 하루 30 상한(첫 판 +5 포함) · 빠른 입력은 valid=false · 끝난 판/만료 CH006")
    void rain() {
        String u = newUser();
        GameDto.RainRun run = gameService.startRain(u, rainStart());
        assertThat(run.getWords()).hasSize(600);
        assertThat(run.getRules()).containsEntry("lives", 6);

        List<GameDto.RainEvent> events = new ArrayList<>();
        List<RainScorer.Event> mirror = new ArrayList<>();
        for (int i = 0; i < 80; i++) {
            events.add(event("hit", i, 1000L + i * 400));
            mirror.add(new RainScorer.Event("hit", i, 1000L + i * 400));
        }
        GameDto.RainResult r = gameService.finishRain(u, run.getRunId(), finish(60_000, events));
        List<RainScorer.Word> words = run.getWords().stream()
                .map(m -> new RainScorer.Word((String) m.get("text"), (String) m.get("kind")))
                .toList();
        assertThat(r.getScore())
                .isEqualTo(RainScorer.score(words, mirror, 60_000).score());
        assertThat(r.isValid()).isTrue();
        assertThat(r.getScore() / 100).isGreaterThan(25);
        assertThat(r.getTalents()).isEqualTo(30);
        assertThat(r.isTalentsCapped()).isTrue();
        assertThat(r.getIsBest()).isTrue();
        assertThat(r.getRanks().getGlobal()).isNotNull();
        assertThat(walletService.wallet(u).getTodayGameTalents()).isEqualTo(30);

        assertCode(
                () -> gameService.finishRain(u, run.getRunId(), finish(60_000, events)), ErrorCode.GAME_RUN_NOT_FOUND);

        // 같은 날 두 번째 판 → 상한이라 0
        GameDto.RainRun run2 = gameService.startRain(u, rainStart());
        GameDto.RainResult r2 = gameService.finishRain(u, run2.getRunId(), finish(60_000, events));
        assertThat(r2.getTalents()).isZero();
        assertThat(r2.isTalentsCapped()).isTrue();

        // 빠른 입력 → valid=false, 달란트 없음
        String u2 = newUser();
        GameDto.RainRun run3 = gameService.startRain(u2, rainStart());
        List<GameDto.RainEvent> fast = new ArrayList<>();
        for (int i = 0; i < 10; i++) fast.add(event("hit", i, 1000L + i * 50));
        GameDto.RainResult r3 = gameService.finishRain(u2, run3.getRunId(), finish(5_000, fast));
        assertThat(r3.isValid()).isFalse();
        assertThat(r3.getTalents()).isZero();
        assertThat(balance(u2)).isZero();

        // 1시간 지나면 만료
        GameDto.RainRun run4 = gameService.startRain(u2, rainStart());
        at(WED_NOON.plus(Duration.ofMinutes(61)));
        assertCode(
                () -> gameService.finishRain(u2, run4.getRunId(), finish(1000, List.of())),
                ErrorCode.GAME_RUN_NOT_FOUND);

        // 입력 검증
        assertCode(
                () -> gameService.startRain(u2, rainStartWithPool(List.of("하나", "둘"))),
                ErrorCode.CHALLENGE_INVALID_INPUT);
    }

    @Test
    @DisplayName("66권: 정답 순서면 단계별 달란트 + 첫 판 보너스, all 단계만 주간 최단 기록")
    void books() {
        String u = newUser();
        GameDto.BooksStart req = new GameDto.BooksStart();
        req.setStage("all");
        GameDto.BooksRun run = gameService.startBooks(u, req);
        assertThat(run.getCards()).hasSize(66).doesNotHaveDuplicates();

        GameDto.BooksFinish fin = new GameDto.BooksFinish();
        fin.setOrder(java.util.stream.IntStream.range(0, 66).boxed().toList());
        fin.setDurationMs(48_200L);
        fin.setMoves(70);
        GameDto.BooksResult r = gameService.finishBooks(u, run.getRunId(), fin);
        assertThat(r.isValid()).isTrue();
        assertThat(r.getTalents()).isEqualTo(15 + 5);
        assertThat(r.getBestMs()).isEqualTo(48_200);
        assertThat(weeklyScoreRepository
                        .findByWeekAndUserId(WEEK, u)
                        .orElseThrow()
                        .getBooksBestMs())
                .isEqualTo(48_200);
        assertThat(gameService.best(u, "books", "all").getWeekBest()).isEqualTo(48_200);

        // 너무 빠르면 invalid
        GameDto.BooksRun run2 = gameService.startBooks(u, req);
        fin.setDurationMs(1000L);
        assertThat(gameService.finishBooks(u, run2.getRunId(), fin).isValid()).isFalse();
    }

    // ───────────────── 리그 ─────────────────

    @Test
    @DisplayName("리그 마감: 위 7명(달란트>0) 승급, 아래 5명·0달란트 강등, 결과 기록, 재실행 안전")
    void leagueFinalize() {
        // 다른 테스트(재실행 포함)와 반이 섞이지 않게 멀리 떨어진 아무 주
        Instant t =
                Instant.parse("2031-01-08T03:00:00Z").plus(Duration.ofDays(7L * new java.util.Random().nextInt(5000)));
        at(t);
        LocalDate week = ChallengeClock.weekOf(t);
        List<String> users = new ArrayList<>();
        for (int k = 0; k < 13; k++) {
            String u = newUser();
            RankingProfile p = profileSupport.getOrCreate(u);
            p.updateLeagueTier(2);
            profileRepository.save(p);
            users.add(u);
            leagueService.get(u); // 반에 들어간다
        }
        for (int k = 0; k < 12; k++) grant(users.get(k), 200 - k * 10); // 마지막 사람은 0
        RankingDto.League league = leagueService.get(users.get(0));
        assertThat(league.getTier()).isEqualTo(2);
        assertThat(league.getEntries()).hasSize(13);
        assertThat(league.getPromote()).isEqualTo(7);
        assertThat(league.getDemote()).isEqualTo(5);
        assertThat(league.getEntries().get(0).getZone()).isEqualTo("up");
        assertThat(league.getEntries().get(7).getZone()).isEqualTo("stay");
        assertThat(league.getEntries().get(12).getZone()).isEqualTo("down");

        assertThat(leagueService.finalizeWeek(week)).isEqualTo(13);
        assertThat(leagueService.finalizeWeek(week)).isZero();
        assertThat(profileRepository.findById(users.get(0)).orElseThrow().getLeagueTier())
                .isEqualTo(3);
        assertThat(profileRepository.findById(users.get(6)).orElseThrow().getLeagueTier())
                .isEqualTo(3);
        assertThat(profileRepository.findById(users.get(7)).orElseThrow().getLeagueTier())
                .isEqualTo(2);
        assertThat(profileRepository.findById(users.get(8)).orElseThrow().getLeagueTier())
                .isEqualTo(1);
        assertThat(profileRepository.findById(users.get(12)).orElseThrow().getLeagueTier())
                .isEqualTo(1);

        at(t.plus(Duration.ofDays(7)));
        RankingDto.League next = leagueService.get(users.get(0));
        assertThat(next.getTier()).isEqualTo(3);
        assertThat(next.getLastResult().getMoved()).isEqualTo("up");
        assertThat(next.getLastResult().getRank()).isEqualTo(1);
    }

    // ───────────────── 교회 · 프로필 · 랭킹 ─────────────────

    @Test
    @DisplayName("교회: 이름 정규화 중복 제거, 30일에 한 번 변경(CH005), 5명 미만 교회 랭킹 잠김")
    void church() {
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        ChurchDto.Registered a = churchService.register("x", register("사랑의 교회" + suffix, "서울 서초구"));
        assertThat(a.created()).isTrue();
        ChurchDto.Registered again =
                churchService.register("x", register(" 사랑의교회" + suffix.toUpperCase() + " ", "서울 서초구"));
        assertThat(again.created()).isFalse();
        assertThat(again.church().getId()).isEqualTo(a.church().getId());
        ChurchDto.Registered other = churchService.register("x", register("사랑의교회" + suffix, "부산 해운대구"));
        assertThat(other.created()).isTrue();
        assertThat(churchService.search("사랑의 교회" + suffix, 20).getItems()).hasSize(2);
        assertCode(() -> churchService.register("x", register("가", "서울")), ErrorCode.CHALLENGE_INVALID_INPUT);

        String u = newUser();
        assertThat(rankingService.rankings(u, "church", null, "talent", null).getLocked())
                .isEqualTo("no_church");
        churchService.setMine(u, a.church().getId(), "청년부");
        RankingDto.Profile p = profileService.get(u);
        assertThat(p.getChurch().getDept()).isEqualTo("청년부");
        assertThat(p.getChurch().getCanChangeAt()).isEqualTo(WED_NOON.plus(Duration.ofDays(30)));
        churchService.setMine(u, a.church().getId(), "장년부"); // 같은 교회 부서만 — 제한 없음
        assertCode(() -> churchService.setMine(u, other.church().getId(), null), ErrorCode.CHURCH_CHANGE_TOO_SOON);
        assertCode(() -> churchService.removeMine(u), ErrorCode.CHURCH_CHANGE_TOO_SOON);
        assertCode(() -> churchService.setMine(u, "nope", null), ErrorCode.CHURCH_NOT_FOUND);

        RankingDto.Board locked = rankingService.rankings(u, "church", null, "talent", null);
        assertThat(locked.getLocked()).isEqualTo("too_few");
        assertThat(locked.getMembers()).isEqualTo(1);

        at(WED_NOON.plus(Duration.ofDays(31)));
        churchService.setMine(u, other.church().getId(), null);
        assertThat(profileService.get(u).getChurch().getId())
                .isEqualTo(other.church().getId());

        // 5명 이상이면 교회 랭킹이 열린다
        for (int k = 0; k < 4; k++) {
            String m = newUser();
            churchService.setMine(m, other.church().getId(), "청년부");
            grant(m, 10 * (k + 1));
        }
        grant(u, 25);
        RankingDto.Board board = rankingService.rankings(u, "church", null, "talent", null);
        assertThat(board.getLocked()).isNull();
        assertThat(board.getEntries()).hasSize(5);
        assertThat(board.getMe().getRank()).isEqualTo(3);
        assertThat(board.getGapToNext()).isEqualTo(5);
    }

    @Test
    @DisplayName("프로필: 닉네임 검증(CH001), 같은 닉네임은 다른 tag, 익명 이름, 전체 랭킹 표시 이름")
    void profile() {
        String u1 = newUser();
        String u2 = newUser();
        String nick = "새벽" + UUID.randomUUID().toString().substring(0, 4).replaceAll("[^a-z0-9]", "a");
        assertCode(() -> profileService.update(u1, update("a", null)), ErrorCode.CHALLENGE_NICKNAME_INVALID);
        assertCode(() -> profileService.update(u1, update("별!!", null)), ErrorCode.CHALLENGE_NICKNAME_INVALID);
        assertCode(() -> profileService.update(u1, update("운영자 별", null)), ErrorCode.CHALLENGE_NICKNAME_INVALID);

        RankingDto.Profile p1 = profileService.update(u1, update("  " + nick + "  ", null));
        RankingDto.Profile p2 = profileService.update(u2, update(nick, true));
        assertThat(p1.getNickname()).isEqualTo(nick);
        assertThat(p1.getTag()).matches("\\d{4}");
        assertThat(p2.getTag()).isNotEqualTo(p1.getTag());
        assertThat(p2.isAnonymous()).isTrue();
        assertThat(p2.getAnonName()).startsWith("익명의 양 #");

        grant(u1, 7);
        grant(u2, 3);
        RankingDto.Board global = rankingService.rankings(u1, "global", null, "talent", WEEK);
        RankingDto.Entry mine = global.getEntries().stream()
                .filter(RankingDto.Entry::isMe)
                .findFirst()
                .orElseThrow();
        assertThat(mine.getName()).isEqualTo(nick + "#" + p1.getTag());
        assertThat(global.getEntries().stream().anyMatch(e -> e.getName().equals(p2.getAnonName())))
                .isTrue();
        assertThat(global.getMe().getValue()).isEqualTo(7);

        assertCode(
                () -> rankingService.rankings(u1, "group", "nope", "talent", null), ErrorCode.SERMON_GROUP_NOT_FOUND);
        assertCode(() -> rankingService.rankings(u1, "global", null, "x", null), ErrorCode.CHALLENGE_INVALID_INPUT);
    }

    // ───────────────── helpers ─────────────────

    private void at(Instant t) {
        clock.useClock(Clock.fixed(t, ZoneOffset.UTC));
    }

    private String newUser() {
        return userRepository
                .save(User.builder()
                        .email("ch-" + UUID.randomUUID() + "@example.com")
                        .name("챌린저")
                        .build())
                .getId();
    }

    /** 이번 주 랭킹 달란트로 amount 를 준다(게임 사유, 하루 상한은 거치지 않음) */
    private void grant(String userId, int amount) {
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            TalentWallet w = ledgerService.lockWallet(userId);
            ledgerService.award(
                    w,
                    TalentLedgerService.Award.builder()
                            .userId(userId)
                            .reason(TalentReason.GAME)
                            .key("test:" + UUID.randomUUID())
                            .amount(amount)
                            .week(clock.currentWeek())
                            .countsForRank(true)
                            .build());
        });
    }

    private int balance(String userId) {
        return walletService.wallet(userId).getBalance();
    }

    private int weekTalents(String userId) {
        return walletService.wallet(userId).getWeekTalents();
    }

    private int balanceAfterCreate(String userId, Map<String, Object> note) {
        create(userId, note);
        return balance(userId);
    }

    private PersonalFeatureDocResponse.Detail create(String userId, Map<String, Object> content) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", content.get("title"));
        body.put("content", content);
        body.put("schema_ver", 1);
        return docService.create(
                userId, "sermon", objectMapper.convertValue(body, PersonalFeatureDocRequest.Create.class));
    }

    private void patch(String userId, String docId, Map<String, Object> content) {
        // 같은 Map 을 계속 고쳐 쓰므로 직렬화로 끊어서 보낸다
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", objectMapper.convertValue(content, Map.class));
        docService.patch(
                userId, "sermon", docId, objectMapper.convertValue(body, PersonalFeatureDocRequest.Patch.class));
    }

    private static Map<String, Object> note(String date, String body) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("title", "한 사람으로 인해");
        n.put("date", date);
        n.put("refs", List.of());
        n.put("body", body);
        n.put("thoughts", new ArrayList<>());
        return n;
    }

    private static Map<String, Object> thought(String id, String tag, String text, boolean done, Long doneAt, long at) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("id", id);
        t.put("tag", tag);
        t.put("text", text);
        t.put("done", done);
        t.put("done_at", doneAt);
        t.put("at", at);
        return t;
    }

    private static GameDto.RainStart rainStart() {
        List<String> pool = new ArrayList<>();
        String[] base = {
            "이러므로", "한사람", "죄가", "세상에", "들어오고", "사망이", "은혜", "선물", "의롭다", "하심", "생명", "왕노릇", "넘쳤나니", "아담", "그리스도", "율법",
            "범죄", "많은", "사람이", "말미암아", "영생", "순종", "정죄", "이르렀"
        };
        for (String s : base) pool.add(s);
        return rainStartWithPool(pool);
    }

    private static GameDto.RainStart rainStartWithPool(List<String> pool) {
        GameDto.RainStart req = new GameDto.RainStart();
        req.setSet("sermon");
        req.setLabel("로마서 5:12–21");
        req.setPool(pool);
        return req;
    }

    private static GameDto.RainEvent event(String type, Integer i, long t) {
        GameDto.RainEvent e = new GameDto.RainEvent();
        e.setType(type);
        e.setI(i);
        e.setT(t);
        return e;
    }

    private static GameDto.RainFinish finish(long duration, List<GameDto.RainEvent> events) {
        GameDto.RainFinish f = new GameDto.RainFinish();
        f.setDurationMs(duration);
        f.setEvents(events);
        return f;
    }

    private static ChurchDto.Register register(String name, String region) {
        ChurchDto.Register r = new ChurchDto.Register();
        r.setName(name);
        r.setRegion(region);
        return r;
    }

    private static RankingDto.UpdateProfile update(String nickname, Boolean anonymous) {
        RankingDto.UpdateProfile r = new RankingDto.UpdateProfile();
        r.setNickname(nickname);
        r.setAnonymous(anonymous);
        return r;
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(code);
    }

    @SuppressWarnings("unused")
    private static LocalDateTime utc(Instant t) {
        return LocalDateTime.ofInstant(t, ZoneOffset.UTC);
    }
}
