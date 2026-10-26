package com.kanban.domain.talent.service;

import com.kanban.domain.ranking.WeeklyScore;
import com.kanban.domain.ranking.WeeklyScoreRepository;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentLedger;
import com.kanban.domain.talent.TalentLedgerRepository;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.TalentWallet;
import com.kanban.domain.talent.TalentWalletRepository;
import com.kanban.domain.talent.dto.TalentDto;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 지갑 조회 · 원장 목록 · 리워드 크레딧 교환. 계약서 §1 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TalentWalletService {

    public static final int GAME_DAILY_CAP = 30;
    public static final int EXCHANGE_RATE = 50;
    public static final int EXCHANGE_MONTHLY_CAP = 20;
    private static final int LEDGER_LIMIT_MAX = 100;

    private final TalentLedgerService ledger;
    private final TalentLedgerRepository ledgerRepository;
    private final TalentWalletRepository walletRepository;
    private final WeeklyScoreRepository weeklyScoreRepository;
    private final UserRepository userRepository;
    private final ChallengeClock clock;

    public TalentDto.Wallet wallet(String userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        int balance =
                walletRepository.findById(userId).map(TalentWallet::getBalance).orElse(0);
        return buildWallet(user, balance);
    }

    public TalentDto.LedgerPage ledger(String userId, Instant before, Integer limit) {
        int size = limit == null ? 30 : Math.max(1, Math.min(LEDGER_LIMIT_MAX, limit));
        Instant cursor = before != null ? before : clock.now().plusSeconds(1);
        List<TalentLedger> rows =
                ledgerRepository.findPage(userId, ChallengeClock.toUtc(cursor), PageRequest.of(0, size + 1));
        boolean more = rows.size() > size;
        List<TalentLedger> page = more ? new ArrayList<>(rows.subList(0, size)) : rows;
        if (more && rows.get(size).getCreatedAt().equals(page.get(size - 1).getCreatedAt())) {
            // 경계 시각의 행을 모두 이 페이지에 담는다 — 다음 커서(< 그 시각)에서 빠지지 않게
            LocalDateTime edge = page.get(size - 1).getCreatedAt();
            page.removeIf(r -> r.getCreatedAt().equals(edge));
            page.addAll(ledgerRepository.findByUserIdAndCreatedAtOrderByAwardSeqDesc(userId, edge));
        }
        List<TalentDto.LedgerItem> items = page.stream()
                .map(r -> TalentDto.LedgerItem.builder()
                        .id(r.getId())
                        .amount(r.getAmount())
                        .reason(r.getReason())
                        .label(r.getLabel())
                        .createdAt(ChallengeClock.fromUtc(r.getCreatedAt()))
                        .build())
                .toList();
        Instant next = more ? ChallengeClock.fromUtc(page.get(page.size() - 1).getCreatedAt()) : null;
        return TalentDto.LedgerPage.builder().items(items).nextBefore(next).build();
    }

    /** 50×credits 달란트 → 리워드 크레딧. 만료 = 다음 달 말(KST) */
    @Transactional
    public TalentDto.Wallet exchange(String userId, Integer credits) {
        if (credits == null || credits < 1 || credits > EXCHANGE_MONTHLY_CAP) {
            throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        }
        TalentWallet wallet = ledger.lockWallet(userId);
        Instant now = clock.now();
        if (exchangedThisMonth(userId, now) + credits > EXCHANGE_MONTHLY_CAP) {
            throw new BusinessException(ErrorCode.TALENT_EXCHANGE_LIMIT);
        }
        int cost = EXCHANGE_RATE * credits;
        if (wallet.getBalance() < cost) {
            throw new BusinessException(ErrorCode.TALENT_INSUFFICIENT);
        }
        User user = userRepository
                .findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String id = UUID.randomUUID().toString();
        ledger.insertOnce(
                wallet,
                TalentLedgerService.Award.builder()
                        .userId(userId)
                        .reason(TalentReason.EXCHANGE)
                        .key("exchange:" + id)
                        .amount(-cost)
                        .sourceId(id)
                        .label("AI 크레딧 " + credits + "개로 교환")
                        .week(ChallengeClock.weekOf(now))
                        .countsForRank(false)
                        .build());
        user.addPersonalRewardCredits(credits, ChallengeClock.toUtc(ChallengeClock.endOfNextMonth(now)));
        return buildWallet(user, wallet.getBalance());
    }

    // ───────────────── internal ─────────────────

    private TalentDto.Wallet buildWallet(User user, int balance) {
        String userId = user.getId();
        Instant now = clock.now();
        LocalDate week = ChallengeClock.weekOf(now);
        LocalDate today = ChallengeClock.dayOf(now);

        int weekTalents = weeklyScoreRepository
                .findByWeekAndUserId(week, userId)
                .map(WeeklyScore::getTalents)
                .orElse(0);
        int todayGame = (int) ledger.sumBetween(
                userId, TalentReason.GAME_REASONS, ChallengeClock.dayStart(today), ChallengeClock.dayEnd(today));

        TreeSet<LocalDate> noteWeeks = ledger.noteWeeks(userId);
        int streak = noteWeeks.contains(week)
                ? TalentLedgerService.streakEndingAt(noteWeeks, week)
                : TalentLedgerService.streakEndingAt(noteWeeks, week.minusWeeks(1));

        int reward = user.getActivePersonalRewardCredits();
        return TalentDto.Wallet.builder()
                .balance(balance)
                .week(week)
                .weekEndsAt(ChallengeClock.weekEnd(week))
                .weekTalents(weekTalents)
                .todayGameTalents(todayGame)
                .gameDailyCap(GAME_DAILY_CAP)
                .streakWeeks(streak)
                .bestStreak(TalentLedgerService.bestStreak(noteWeeks))
                .weekComplete(TalentDto.WeekComplete.builder()
                        .note(ledger.countActive(userId, week, TalentReason.NOTE) > 0)
                        .applyDone(ledger.countActive(userId, week, TalentReason.APPLY_DONE) > 0)
                        .done(ledger.state(userId, "complete:" + week).active())
                        .build())
                .rewardCredits(reward)
                .rewardExpiresAt(
                        reward > 0 && user.getPersonalRewardExpiresAt() != null
                                ? ChallengeClock.fromUtc(user.getPersonalRewardExpiresAt())
                                : null)
                .exchangedThisMonth(exchangedThisMonth(userId, now))
                .exchangeMonthlyCap(EXCHANGE_MONTHLY_CAP)
                .exchangeRate(EXCHANGE_RATE)
                .personalCreditsAvailable(user.getPersonalAvailableCredits())
                .build();
    }

    private int exchangedThisMonth(String userId, Instant now) {
        long sum = ledger.sumBetween(
                userId, List.of(TalentReason.EXCHANGE), ChallengeClock.monthStart(now), ChallengeClock.monthEnd(now));
        return (int) (-sum / EXCHANGE_RATE);
    }
}
