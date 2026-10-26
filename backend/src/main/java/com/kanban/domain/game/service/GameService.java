package com.kanban.domain.game.service;

import com.kanban.domain.game.GameRun;
import com.kanban.domain.game.GameRunRepository;
import com.kanban.domain.game.dto.GameDto;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.ranking.service.RankingService;
import com.kanban.domain.ranking.service.WeeklyScoreService;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.TalentWallet;
import com.kanban.domain.talent.service.TalentLedgerService;
import com.kanban.domain.talent.service.TalentWalletService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.security.SecureRandom;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임 판 시작·끝. 점수는 서버가 이벤트로 다시 계산한다(계약서 §4). 유효한 판만 달란트·주간 최고 기록에 들어간다.
 *
 * <p>게임 달란트는 하루(KST) 30 상한 — 그날 첫 완료 판 보너스(+5)도 이 안에 포함.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class GameService {

    public static final int WORDS_LENGTH = 600;
    public static final double GOLD_RATE = 0.06;
    public static final double GALPI_RATE = 0.05;
    public static final String GALPI_TEXT = "갈피";
    public static final int POOL_MIN = 20;
    public static final int POOL_MAX = 400;
    public static final int WORD_MIN = 2;
    public static final int WORD_MAX = 7;
    public static final int EVENTS_MAX = 10_000;
    public static final int FIRST_BONUS = 5;
    public static final Duration RUN_TTL = Duration.ofHours(1);

    private static final Pattern SET = Pattern.compile("^[A-Za-z0-9_-]{1,20}$");
    private static final LocalDateTime EPOCH = LocalDateTime.of(2000, 1, 1, 0, 0);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final GameRunRepository runRepository;
    private final TalentLedgerService ledger;
    private final WeeklyScoreService weeklyScoreService;
    private final RankingService rankingService;
    private final ChallengeClock clock;

    // ───────────────── 말씀 산성비 ─────────────────

    public GameDto.RainRun startRain(String userId, GameDto.RainStart request) {
        String set = request.getSet();
        if (set == null || !SET.matcher(set).matches()) throw invalid();
        List<String> pool = cleanPool(request.getPool());
        String label = request.getLabel() == null ? null : request.getLabel().strip();
        if (label != null && label.length() > 200) label = label.substring(0, 200);

        long seed = 1 + RANDOM.nextInt(Integer.MAX_VALUE - 1);
        List<Map<String, Object>> words = rainWords(pool, seed);
        GameRun run = runRepository.save(GameRun.builder()
                .userId(userId)
                .game(GameRun.GAME_RAIN)
                .stage(set)
                .label(label)
                .seed(seed)
                .payload(Map.of("words", words))
                .status(GameRun.STATUS_OPEN)
                .createdAt(clock.nowUtc())
                .build());
        return GameDto.RainRun.builder()
                .runId(run.getId())
                .seed(seed)
                .words(words)
                .rules(rainRules())
                .build();
    }

    public GameDto.RainResult finishRain(String userId, String runId, GameDto.RainFinish request) {
        GameRun run = openRun(userId, runId, GameRun.GAME_RAIN);
        if (request.getDurationMs() == null || request.getDurationMs() < 0) throw invalid();
        long duration = request.getDurationMs();
        List<RainScorer.Word> words = storedWords(run);
        List<RainScorer.Event> events = parseEvents(request.getEvents(), words.size());
        RainScorer.Result result = RainScorer.score(words, events, duration);

        TalentWallet wallet = ledger.lockWallet(userId);
        LocalDate week = clock.currentWeek();
        Integer prevBest = runRepository.maxScoreSince(userId, GameRun.GAME_RAIN, EPOCH);

        int[] granted = {0, 0};
        if (result.valid()) {
            String label =
                    "말씀 산성비 " + NumberFormat.getIntegerInstance(Locale.US).format(result.score()) + "점";
            granted = grantGameTalents(wallet, userId, run.getId(), result.score() / 100, label);
            weeklyScoreService.offerRain(userId, week, result.score());
        }
        run.finish(
                result.score(),
                (int) Math.min(Integer.MAX_VALUE, duration),
                result.valid(),
                granted[0],
                clock.nowUtc());

        boolean isBest = result.valid() && (prevBest == null || result.score() > prevBest);
        Integer best = isBest ? Integer.valueOf(result.score()) : prevBest;
        return GameDto.RainResult.builder()
                .score(result.score())
                .valid(result.valid())
                .talents(granted[0])
                .talentsCapped(granted[1] == 1)
                .best(best)
                .isBest(isBest)
                .ranks(rankingService.ranksFor(userId, RankingService.BOARD_RAIN, week))
                .build();
    }

    // ───────────────── 66권 줄 세우기 ─────────────────

    public GameDto.BooksRun startBooks(String userId, GameDto.BooksStart request) {
        String stage = request.getStage();
        if (stage == null || !BooksRules.STAGES.containsKey(stage)) throw invalid();
        long seed = 1 + RANDOM.nextInt(Integer.MAX_VALUE - 1);
        List<Integer> cards = new ArrayList<>(BooksRules.cards(stage));
        Collections.shuffle(cards, new Random(seed));
        GameRun run = runRepository.save(GameRun.builder()
                .userId(userId)
                .game(GameRun.GAME_BOOKS)
                .stage(stage)
                .seed(seed)
                .payload(Map.of("cards", cards))
                .status(GameRun.STATUS_OPEN)
                .createdAt(clock.nowUtc())
                .build());
        return GameDto.BooksRun.builder()
                .runId(run.getId())
                .stage(stage)
                .cards(cards)
                .build();
    }

    public GameDto.BooksResult finishBooks(String userId, String runId, GameDto.BooksFinish request) {
        GameRun run = openRun(userId, runId, GameRun.GAME_BOOKS);
        if (request.getDurationMs() == null || request.getDurationMs() < 0 || request.getOrder() == null)
            throw invalid();
        if (request.getMoves() != null && request.getMoves() < 0) throw invalid();
        if (request.getOrder().size() > 66 || request.getOrder().contains(null)) throw invalid();
        long duration = request.getDurationMs();
        String stage = run.getStage();
        boolean valid = BooksRules.isValid(stage, request.getOrder(), duration);
        int ms = (int) Math.min(Integer.MAX_VALUE, duration);

        TalentWallet wallet = ledger.lockWallet(userId);
        LocalDate week = clock.currentWeek();
        Integer prevBest = runRepository.minScoreSince(userId, GameRun.GAME_BOOKS, stage, EPOCH);

        int[] granted = {0, 0};
        if (valid) {
            String label = "66권 줄 세우기 " + String.format(Locale.US, "%.1f", ms / 1000.0) + "초";
            granted = grantGameTalents(wallet, userId, run.getId(), BooksRules.TALENTS.get(stage), label);
            if (BooksRules.STAGE_ALL.equals(stage)) weeklyScoreService.offerBooks(userId, week, ms);
        }
        run.finish(ms, ms, valid, granted[0], clock.nowUtc());

        boolean isBest = valid && (prevBest == null || ms < prevBest);
        RankingDto.Ranks ranks = rankingService.ranksFor(userId, RankingService.BOARD_BOOKS, week);
        if (!BooksRules.STAGE_ALL.equals(stage)) {
            // 단계별 랭킹은 없다 — 리그 순위만
            ranks = RankingDto.Ranks.builder().league(ranks.getLeague()).build();
        }
        return GameDto.BooksResult.builder()
                .timeMs(ms)
                .valid(valid)
                .talents(granted[0])
                .talentsCapped(granted[1] == 1)
                .bestMs(isBest ? Integer.valueOf(ms) : prevBest)
                .isBest(isBest)
                .ranks(ranks)
                .build();
    }

    @Transactional(readOnly = true)
    public GameDto.Best best(String userId, String game, String stage) {
        LocalDateTime weekStart = ChallengeClock.toUtc(ChallengeClock.weekStart(clock.currentWeek()));
        if (GameRun.GAME_RAIN.equals(game)) {
            return GameDto.Best.builder()
                    .best(runRepository.maxScoreSince(userId, game, EPOCH))
                    .weekBest(runRepository.maxScoreSince(userId, game, weekStart))
                    .build();
        }
        if (GameRun.GAME_BOOKS.equals(game)) {
            String s = stage == null || stage.isBlank() ? BooksRules.STAGE_ALL : stage;
            if (!BooksRules.STAGES.containsKey(s)) throw invalid();
            return GameDto.Best.builder()
                    .best(runRepository.minScoreSince(userId, game, s, EPOCH))
                    .weekBest(runRepository.minScoreSince(userId, game, s, weekStart))
                    .build();
        }
        throw invalid();
    }

    // ───────────────── internal ─────────────────

    /**
     * 하루 30 안에서 [그날 첫 판 +5] + [base] 를 준다.
     *
     * @return {준 달란트, 상한으로 깎였으면 1}
     */
    int[] grantGameTalents(TalentWallet wallet, String userId, String runId, int base, String label) {
        Instant now = clock.now();
        LocalDate today = ChallengeClock.dayOf(now);
        LocalDate week = ChallengeClock.weekOf(now);
        int used = (int) ledger.sumBetween(
                userId, TalentReason.GAME_REASONS, ChallengeClock.dayStart(today), ChallengeClock.dayEnd(today));
        int remaining = Math.max(0, TalentWalletService.GAME_DAILY_CAP - used);
        int granted = 0;
        boolean capped = false;

        String firstKey = "game_first:" + today;
        if (!ledger.state(userId, firstKey).active()) {
            int first = Math.min(FIRST_BONUS, remaining);
            if (first < FIRST_BONUS) capped = true;
            if (first > 0) {
                ledger.award(wallet, award(userId, TalentReason.GAME_FIRST, firstKey, first, runId, "오늘 첫 게임", week));
                granted += first;
                remaining -= first;
            }
        }
        int game = Math.min(Math.max(0, base), remaining);
        if (game < base) capped = true;
        if (game > 0) {
            ledger.award(wallet, award(userId, TalentReason.GAME, "game:" + runId, game, runId, label, week));
            granted += game;
        }
        return new int[] {granted, capped ? 1 : 0};
    }

    private static TalentLedgerService.Award award(
            String userId, String reason, String key, int amount, String runId, String label, LocalDate week) {
        return TalentLedgerService.Award.builder()
                .userId(userId)
                .reason(reason)
                .key(key)
                .amount(amount)
                .sourceId(runId)
                .label(label)
                .week(week)
                .countsForRank(true)
                .build();
    }

    private GameRun openRun(String userId, String runId, String game) {
        GameRun run = runRepository
                .findForUpdate(runId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_RUN_NOT_FOUND));
        boolean expired =
                !clock.now().isBefore(ChallengeClock.fromUtc(run.getCreatedAt()).plus(RUN_TTL));
        if (!run.getUserId().equals(userId) || !game.equals(run.getGame()) || !run.isOpen() || expired) {
            throw new BusinessException(ErrorCode.GAME_RUN_NOT_FOUND);
        }
        return run;
    }

    /** 앞뒤 공백 제거 · 2~7자만 · 중복 제거. 남은 단어가 20개 미만이거나 원본이 400개 넘으면 CH002 */
    static List<String> cleanPool(List<String> raw) {
        if (raw == null || raw.size() > POOL_MAX) throw invalid();
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String w : raw) {
            if (w == null) continue;
            String s = w.strip();
            int len = s.codePointCount(0, s.length());
            if (len >= WORD_MIN && len <= WORD_MAX) out.add(s);
        }
        if (out.size() < POOL_MIN) throw invalid();
        return new ArrayList<>(out);
    }

    /** 시드로 섞은 600개. 약 6% gold, 5% galpi(text "갈피") */
    static List<Map<String, Object>> rainWords(List<String> pool, long seed) {
        Random rnd = new Random(seed);
        List<String> bag = new ArrayList<>();
        List<Map<String, Object>> words = new ArrayList<>(WORDS_LENGTH);
        for (int i = 0; i < WORDS_LENGTH; i++) {
            double r = rnd.nextDouble();
            String kind;
            String text;
            if (r < GALPI_RATE) {
                kind = RainScorer.KIND_GALPI;
                text = GALPI_TEXT;
            } else {
                if (bag.isEmpty()) {
                    bag.addAll(pool);
                    Collections.shuffle(bag, rnd);
                }
                text = bag.remove(bag.size() - 1);
                kind = r < GALPI_RATE + GOLD_RATE ? RainScorer.KIND_GOLD : "";
            }
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("i", i);
            w.put("text", text);
            w.put("kind", kind);
            words.add(w);
        }
        return words;
    }

    private static Map<String, Object> rainRules() {
        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("lives", RainScorer.LIVES);
        rules.put("level_every", RainScorer.LEVEL_EVERY);
        rules.put("min_gap_ms", RainScorer.MIN_GAP_MS);
        rules.put("max_duration_ms", RainScorer.MAX_DURATION_MS);
        return rules;
    }

    @SuppressWarnings("unchecked")
    private static List<RainScorer.Word> storedWords(GameRun run) {
        Object raw = run.getPayload().get("words");
        List<RainScorer.Word> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                Map<String, Object> m = (Map<String, Object>) o;
                out.add(new RainScorer.Word(String.valueOf(m.get("text")), String.valueOf(m.getOrDefault("kind", ""))));
            }
        }
        return out;
    }

    private static List<RainScorer.Event> parseEvents(List<GameDto.RainEvent> raw, int wordCount) {
        if (raw == null) return List.of();
        if (raw.size() > EVENTS_MAX) throw invalid();
        List<RainScorer.Event> out = new ArrayList<>(raw.size());
        for (GameDto.RainEvent e : raw) {
            if (e == null || e.getType() == null || e.getT() == null) throw invalid();
            switch (e.getType()) {
                case "hit" -> {
                    if (e.getI() == null || e.getI() < 0 || e.getI() >= wordCount) throw invalid();
                }
                case "drop" -> {
                    if (e.getI() != null && (e.getI() < 0 || e.getI() >= wordCount)) throw invalid();
                }
                case "miss" -> {}
                default -> throw invalid();
            }
            out.add(new RainScorer.Event(e.getType(), e.getI(), e.getT()));
        }
        return out;
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
    }
}
