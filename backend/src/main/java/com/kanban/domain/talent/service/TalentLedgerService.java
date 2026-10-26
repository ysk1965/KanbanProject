package com.kanban.domain.talent.service;

import com.kanban.domain.ranking.service.LeagueMembershipService;
import com.kanban.domain.ranking.service.WeeklyScoreService;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentLedger;
import com.kanban.domain.talent.TalentLedgerRepository;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.TalentWallet;
import com.kanban.domain.talent.TalentWalletRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import lombok.Builder;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 달란트 원장 쓰기의 유일한 입구.
 *
 * <p>규칙
 *
 * <ul>
 *   <li>같은 award_key 는 합이 0 보다 클 때 "살아 있다". 살아 있으면 다시 적립하지 않는다.
 *   <li>조건이 사라지면 같은 키로 음수 행(상쇄)을 쌓는다. 다시 조건이 맞으면 seq 를 하나 더 늘려 재적립한다.
 *   <li>상쇄 행은 원래 적립의 week · counts_for_rank 를 그대로 따른다 — 그 주 랭킹 점수에서 정확히 빠진다.
 *   <li>모든 쓰기 전에 {@link #lockWallet(String)} 으로 사용자 지갑 행을 잠근다. 상한 계산·잔액·주간 점수가 한 줄로 처리된다.
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional
public class TalentLedgerService {

    private static final int LABEL_MAX = 200;

    private final TalentLedgerRepository ledgerRepository;
    private final TalentWalletRepository walletRepository;
    private final WeeklyScoreService weeklyScoreService;
    private final LeagueMembershipService leagueMembershipService;
    private final ChallengeClock clock;
    private final PlatformTransactionManager transactionManager;

    /** 적립 요청 */
    @Builder
    public record Award(
            String userId,
            String reason,
            String key,
            int amount,
            String sourceId,
            String label,
            LocalDate week,
            boolean countsForRank) {}

    /** 키 하나의 현재 상태. net &gt; 0 이면 살아 있음 */
    public record KeyState(String key, int net, TalentLedger lastAward) {
        public boolean active() {
            return net > 0;
        }

        public LocalDate week() {
            return lastAward != null ? lastAward.getWeek() : null;
        }
    }

    // ───────────────── 잠금 ─────────────────

    /** 사용자 지갑을 잠근다(없으면 만든다). 트랜잭션 안에서 불러야 한다. */
    public TalentWallet lockWallet(String userId) {
        return walletRepository.findForUpdate(userId).orElseGet(() -> {
            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            try {
                tx.executeWithoutResult(s -> walletRepository.saveAndFlush(
                        TalentWallet.builder().userId(userId).balance(0).build()));
            } catch (DataIntegrityViolationException ignored) {
                // 다른 요청이 먼저 만들었다
            }
            return walletRepository.findForUpdate(userId).orElseThrow();
        });
    }

    // ───────────────── 적립 · 상쇄 ─────────────────

    /** 적립. 이미 살아 있으면 아무것도 하지 않고 false. amount 가 0 이하이면 false. */
    public boolean award(TalentWallet wallet, Award a) {
        if (a.amount() <= 0) return false;
        List<TalentLedger> rows = ledgerRepository.findByUserIdAndAwardKeyOrderByAwardSeqAsc(a.userId(), a.key());
        int net = rows.stream().mapToInt(TalentLedger::getAmount).sum();
        if (net > 0) return false;
        insert(
                wallet,
                a.userId(),
                a.reason(),
                a.key(),
                rows.size(),
                a.amount(),
                a.sourceId(),
                a.label(),
                a.week(),
                a.countsForRank());
        return true;
    }

    /** 상쇄. 살아 있지 않으면 false */
    public boolean reverse(TalentWallet wallet, String userId, String key) {
        List<TalentLedger> rows = ledgerRepository.findByUserIdAndAwardKeyOrderByAwardSeqAsc(userId, key);
        int net = rows.stream().mapToInt(TalentLedger::getAmount).sum();
        if (net <= 0) return false;
        TalentLedger last = lastPositive(rows);
        insert(
                wallet,
                userId,
                last.getReason(),
                key,
                rows.size(),
                -net,
                last.getSourceId(),
                "취소 · " + (last.getLabel() != null ? last.getLabel() : last.getReason()),
                last.getWeek(),
                last.isCountsForRank());
        return true;
    }

    /** 차감처럼 키가 매번 새로운 일회성 행 (교환) */
    public void insertOnce(TalentWallet wallet, Award a) {
        insert(
                wallet,
                a.userId(),
                a.reason(),
                a.key(),
                0,
                a.amount(),
                a.sourceId(),
                a.label(),
                a.week(),
                a.countsForRank());
    }

    private void insert(
            TalentWallet wallet,
            String userId,
            String reason,
            String key,
            int seq,
            int amount,
            String sourceId,
            String label,
            LocalDate week,
            boolean countsForRank) {
        ledgerRepository.save(TalentLedger.builder()
                .userId(userId)
                .reason(reason)
                .awardKey(key)
                .awardSeq(seq)
                .amount(amount)
                .sourceId(sourceId)
                .label(truncate(label))
                .week(week)
                .countsForRank(countsForRank)
                .createdAt(clock.nowUtc())
                .build());
        wallet.add(amount);
        if (countsForRank) {
            weeklyScoreService.addTalents(userId, week, amount);
            // 그 주 첫 적립 때 리그 반에 들어간다
            if (amount > 0 && week.equals(clock.currentWeek())) {
                leagueMembershipService.ensureMember(userId, week);
            }
        }
    }

    // ───────────────── 조회 ─────────────────

    public KeyState state(String userId, String key) {
        return toState(key, ledgerRepository.findByUserIdAndAwardKeyOrderByAwardSeqAsc(userId, key));
    }

    /** 한 근거(문서 등)에서 나온 살아 있는 키들 */
    public Map<String, KeyState> activeBySource(String userId, String sourceId) {
        return activeOf(ledgerRepository.findByUserIdAndSourceIdOrderByAwardSeqAsc(userId, sourceId));
    }

    /** 그 주에 살아 있는 특정 사유의 키 수 (주간 상한) */
    public int countActive(String userId, LocalDate week, String reason) {
        return activeOf(ledgerRepository.findByUserIdAndWeekAndReasonIn(userId, week, List.of(reason)))
                .size();
    }

    /** 살아 있는 note 가 있는 주 목록 (오름차순) */
    public TreeSet<LocalDate> noteWeeks(String userId) {
        TreeSet<LocalDate> weeks = new TreeSet<>();
        activeOf(ledgerRepository.findByUserIdAndReason(userId, TalentReason.NOTE))
                .values()
                .forEach(s -> weeks.add(s.week()));
        return weeks;
    }

    /** week 에서 거슬러 올라가며 note 가 있는 주가 몇 주 연속인지 */
    public static int streakEndingAt(Set<LocalDate> noteWeeks, LocalDate week) {
        int n = 0;
        LocalDate w = week;
        while (noteWeeks.contains(w)) {
            n++;
            w = w.minusWeeks(1);
        }
        return n;
    }

    public static int bestStreak(TreeSet<LocalDate> noteWeeks) {
        int best = 0;
        int run = 0;
        LocalDate prev = null;
        for (LocalDate w : noteWeeks) {
            run = prev != null && prev.plusWeeks(1).equals(w) ? run + 1 : 1;
            best = Math.max(best, run);
            prev = w;
        }
        return best;
    }

    public long sumBetween(String userId, Collection<String> reasons, java.time.Instant from, java.time.Instant to) {
        return ledgerRepository.sumByReasonsBetween(
                userId, reasons, ChallengeClock.toUtc(from), ChallengeClock.toUtc(to));
    }

    private static Map<String, KeyState> activeOf(List<TalentLedger> rows) {
        Map<String, List<TalentLedger>> byKey = new LinkedHashMap<>();
        for (TalentLedger r : rows)
            byKey.computeIfAbsent(r.getAwardKey(), k -> new ArrayList<>()).add(r);
        Map<String, KeyState> out = new HashMap<>();
        byKey.forEach((key, list) -> {
            list.sort((a, b) -> Integer.compare(a.getAwardSeq(), b.getAwardSeq()));
            KeyState s = toState(key, list);
            if (s.active()) out.put(key, s);
        });
        return out;
    }

    private static KeyState toState(String key, List<TalentLedger> rows) {
        int net = rows.stream().mapToInt(TalentLedger::getAmount).sum();
        return new KeyState(key, net, lastPositive(rows));
    }

    private static TalentLedger lastPositive(List<TalentLedger> rows) {
        TalentLedger last = null;
        for (TalentLedger r : rows) if (r.getAmount() > 0) last = r;
        return last;
    }

    private static String truncate(String label) {
        if (label == null) return null;
        return label.length() > LABEL_MAX ? label.substring(0, LABEL_MAX - 1) + "…" : label;
    }
}
