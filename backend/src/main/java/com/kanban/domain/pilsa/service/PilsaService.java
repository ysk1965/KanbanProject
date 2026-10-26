package com.kanban.domain.pilsa.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.pilsa.PilsaPlan;
import com.kanban.domain.pilsa.PilsaPlanRepository;
import com.kanban.domain.pilsa.PilsaVerse;
import com.kanban.domain.pilsa.PilsaVerseRepository;
import com.kanban.domain.pilsa.dto.PilsaDto;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.TalentWallet;
import com.kanban.domain.talent.service.TalentLedgerService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 이번 주 말씀 필사. 계약서: docs/Tech/sermon-pilsa-api.md
 *
 * <ul>
 *   <li>일곱 장은 프런트가 고르고, 서버는 그 주에 처음 받은 것을 고정한다(먼저 온 것이 이김).
 *   <li>절은 (user, week, b, c, v) 로 한 번만 기록한다(멱등).
 *   <li>한 장을 다 쓰면 +5 (pilsa), 일곱 장을 다 쓰면 +20 (pilsa_week). 게임 하루 상한과 무관하고 주간 랭킹에 들어간다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PilsaService {

    public static final int CHAPTER_COUNT = 7;
    public static final int BOOK_MAX = 65;
    public static final int CHAPTER_MAX = 150;
    public static final int VERSES_MAX = 176;
    public static final int CHAPTER_AMOUNT = 5;
    public static final int WEEK_AMOUNT = 20;
    public static final int MIN_MS = 600;
    public static final int MAX_CHARS_PER_SEC = 15;
    public static final Set<String> REASONS = Set.of("main", "cited", "near", "next", "common");

    /** 원장 라벨용 책 이름 (0 = 창세기 … 65 = 요한계시록, 프런트 BOOKS 순서) */
    static final String[] BOOK_NAMES = {
        "창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기", "사무엘상", "사무엘하", "열왕기상", "열왕기하", "역대상", "역대하", "에스라",
        "느헤미야", "에스더", "욥기", "시편", "잠언", "전도서", "아가", "이사야", "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스", "오바댜",
        "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기", "마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서", "고린도전서",
        "고린도후서", "갈라디아서", "에베소서", "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서",
        "베드로전서", "베드로후서", "요한일서", "요한이서", "요한삼서", "유다서", "요한계시록"
    };

    /** pilsa_plans.chapters 의 한 칸 */
    public record StoredChapter(int b, int c, String reason, int verses) {}

    private static final TypeReference<List<StoredChapter>> CHAPTERS_TYPE = new TypeReference<>() {};

    private final PilsaPlanRepository planRepository;
    private final PilsaVerseRepository verseRepository;
    private final TalentLedgerService ledger;
    private final ChallengeClock clock;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;

    // ───────────────── 이번 주 일곱 장 ─────────────────

    @Transactional(readOnly = true)
    public PilsaDto.Week week(String userId) {
        LocalDate week = clock.currentWeek();
        return toWeek(userId, week, planRepository.findByUserIdAndWeek(userId, week));
    }

    /** 먼저 온 것이 이긴다. 이미 있으면 바꾸지 않고 저장된 것을 돌려준다. */
    public PilsaDto.Week putWeek(String userId, PilsaDto.PutWeek request) {
        LocalDate week = clock.currentWeek();
        if (request == null || !week.equals(request.getWeek())) {
            throw new BusinessException(ErrorCode.PILSA_NOT_THIS_WEEK);
        }
        List<StoredChapter> chapters = validatePlan(request.getChapters());

        Optional<PilsaPlan> existing = planRepository.findByUserIdAndWeek(userId, week);
        if (existing.isEmpty()) {
            PilsaPlan plan = PilsaPlan.builder()
                    .userId(userId)
                    .week(week)
                    .chapters(writeChapters(chapters))
                    .createdAt(clock.nowUtc())
                    .build();
            try {
                newTx().executeWithoutResult(s -> planRepository.saveAndFlush(plan));
            } catch (DataIntegrityViolationException ignored) {
                // 다른 요청(다른 기기)이 먼저 정했다 — 그것을 돌려준다
            }
            existing = planRepository.findByUserIdAndWeek(userId, week);
        }
        return toWeek(userId, week, existing);
    }

    // ───────────────── 한 절 쓰기 ─────────────────

    @Transactional
    public PilsaDto.VerseResult writeVerse(String userId, PilsaDto.VerseIn request) {
        LocalDate week = clock.currentWeek();
        if (request == null || !week.equals(request.getWeek())) {
            throw new BusinessException(ErrorCode.PILSA_NOT_THIS_WEEK);
        }
        List<StoredChapter> plan = planRepository
                .findByUserIdAndWeek(userId, week)
                .map(p -> readChapters(p.getChapters()))
                .orElse(List.of());
        Integer b = request.getB();
        Integer c = request.getC();
        StoredChapter chapter = b == null || c == null
                ? null
                : plan.stream()
                        .filter(ch -> ch.b() == b && ch.c() == c)
                        .findFirst()
                        .orElse(null);
        if (chapter == null) throw new BusinessException(ErrorCode.PILSA_CHAPTER_NOT_IN_PLAN);
        Integer v = request.getV();
        if (v == null || v < 1 || v > chapter.verses()) throw new BusinessException(ErrorCode.PILSA_INVALID);
        if (tooFast(request.getChars(), request.getMs())) throw new BusinessException(ErrorCode.PILSA_TOO_FAST);

        // 원장 쓰기 규칙: 지갑을 먼저 잠근다 — 같은 사용자의 필사 요청이 한 줄로 처리된다
        TalentWallet wallet = ledger.lockWallet(userId);

        if (!verseRepository.existsByUserIdAndWeekAndBookAndChapterAndVerse(userId, week, b, c, v)) {
            PilsaVerse verse = PilsaVerse.builder()
                    .userId(userId)
                    .week(week)
                    .book(b)
                    .chapter(c)
                    .verse(v)
                    .chars(request.getChars())
                    .ms((int) Math.min(Integer.MAX_VALUE, request.getMs()))
                    .createdAt(clock.nowUtc())
                    .build();
            try {
                // 별도 트랜잭션 — 유니크 충돌이 이 트랜잭션을 깨뜨리지 않게
                newTx().executeWithoutResult(s -> verseRepository.saveAndFlush(verse));
            } catch (DataIntegrityViolationException ignored) {
                // 같은 절이 이미 기록됐다(멱등)
            }
        }

        Map<String, TreeSet<Integer>> doneByChapter = doneByChapter(userId, week);
        int awarded = 0;
        // 조건이 맞으면 매번 award 를 부른다 — 이미 살아 있는 키는 다시 적립되지 않고(0), 지난번에 빠진 적립은 여기서 메워진다
        boolean chapterDone = isDone(chapter, doneByChapter);
        if (chapterDone) {
            String label = "말씀 필사 · " + bookName(chapter.b()) + " " + chapter.c() + "장";
            if (ledger.award(
                    wallet,
                    award(userId, TalentReason.PILSA, chapterKey(week, chapter), CHAPTER_AMOUNT, label, week))) {
                awarded += CHAPTER_AMOUNT;
            }
        }
        boolean weekDone = plan.size() == CHAPTER_COUNT && plan.stream().allMatch(ch -> isDone(ch, doneByChapter));
        if (weekDone) {
            if (ledger.award(
                    wallet,
                    award(
                            userId,
                            TalentReason.PILSA_WEEK,
                            "pilsa_week:" + week,
                            WEEK_AMOUNT,
                            "말씀 필사 · 이번 주 일곱 장",
                            week))) {
                awarded += WEEK_AMOUNT;
            }
        }

        return PilsaDto.VerseResult.builder()
                .b(b)
                .c(c)
                .done(new ArrayList<>(doneByChapter.getOrDefault(chapterId(b, c), new TreeSet<>())))
                .chapterDone(chapterDone)
                .weekDone(weekDone)
                .awarded(awarded)
                .build();
    }

    // ───────────────── internal ─────────────────

    /** 정확히 7개, (b,c) 중복 없음, 범위 안, reason 은 정해진 값 */
    static List<StoredChapter> validatePlan(List<PilsaDto.ChapterIn> raw) {
        if (raw == null || raw.size() != CHAPTER_COUNT) throw invalid();
        List<StoredChapter> out = new ArrayList<>(CHAPTER_COUNT);
        Set<String> seen = new HashSet<>();
        for (PilsaDto.ChapterIn ch : raw) {
            if (ch == null || ch.getB() == null || ch.getC() == null || ch.getVerses() == null) throw invalid();
            int b = ch.getB();
            int c = ch.getC();
            int verses = ch.getVerses();
            if (b < 0 || b > BOOK_MAX || c < 1 || c > CHAPTER_MAX || verses < 1 || verses > VERSES_MAX) throw invalid();
            if (ch.getReason() == null || !REASONS.contains(ch.getReason())) throw invalid();
            if (!seen.add(chapterId(b, c))) throw invalid();
            out.add(new StoredChapter(b, c, ch.getReason(), verses));
        }
        return out;
    }

    /** chars ≤ 0, ms &lt; 600, 또는 1초에 15자 초과 */
    static boolean tooFast(Integer chars, Long ms) {
        if (chars == null || chars <= 0) return true;
        if (ms == null || ms < MIN_MS) return true;
        return (long) chars * 1000 > (long) MAX_CHARS_PER_SEC * ms;
    }

    private PilsaDto.Week toWeek(String userId, LocalDate week, Optional<PilsaPlan> plan) {
        List<PilsaDto.Chapter> chapters = new ArrayList<>();
        int completed = 0;
        if (plan.isPresent()) {
            Map<String, TreeSet<Integer>> done = doneByChapter(userId, week);
            for (StoredChapter ch : readChapters(plan.get().getChapters())) {
                if (isDone(ch, done)) completed++;
                chapters.add(PilsaDto.Chapter.builder()
                        .b(ch.b())
                        .c(ch.c())
                        .reason(ch.reason())
                        .verses(ch.verses())
                        .done(new ArrayList<>(done.getOrDefault(chapterId(ch.b(), ch.c()), new TreeSet<>())))
                        .build());
            }
        }
        return PilsaDto.Week.builder()
                .week(week)
                .endsAt(ChallengeClock.weekEnd(week))
                .chapters(chapters)
                .completedChapters(completed)
                .weekDone(!chapters.isEmpty() && completed == chapters.size())
                .build();
    }

    private Map<String, TreeSet<Integer>> doneByChapter(String userId, LocalDate week) {
        Map<String, TreeSet<Integer>> out = new HashMap<>();
        for (PilsaVerse v : verseRepository.findByUserIdAndWeek(userId, week)) {
            out.computeIfAbsent(chapterId(v.getBook(), v.getChapter()), k -> new TreeSet<>())
                    .add(v.getVerse());
        }
        return out;
    }

    /** 1..verses 를 모두 썼는지 (범위 밖 절은 기록되지 않으므로 개수로 충분) */
    private static boolean isDone(StoredChapter ch, Map<String, TreeSet<Integer>> done) {
        TreeSet<Integer> set = done.get(chapterId(ch.b(), ch.c()));
        return set != null && set.subSet(1, true, ch.verses(), true).size() >= ch.verses();
    }

    private static String chapterId(int b, int c) {
        return b + ":" + c;
    }

    private static String chapterKey(LocalDate week, StoredChapter ch) {
        return "pilsa:" + week + ":" + ch.b() + ":" + ch.c();
    }

    static String bookName(int b) {
        return b >= 0 && b < BOOK_NAMES.length ? BOOK_NAMES[b] : String.valueOf(b);
    }

    private static TalentLedgerService.Award award(
            String userId, String reason, String key, int amount, String label, LocalDate week) {
        return TalentLedgerService.Award.builder()
                .userId(userId)
                .reason(reason)
                .key(key)
                .amount(amount)
                .sourceId("pilsa:" + week)
                .label(label)
                .week(week)
                .countsForRank(true)
                .build();
    }

    private String writeChapters(List<StoredChapter> chapters) {
        try {
            return objectMapper.writeValueAsString(chapters);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("pilsa chapters 직렬화 실패", e);
        }
    }

    private List<StoredChapter> readChapters(String json) {
        try {
            return objectMapper.readValue(json, CHAPTERS_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("pilsa chapters 읽기 실패", e);
        }
    }

    private TransactionTemplate newTx() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return tx;
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.PILSA_INVALID);
    }
}
