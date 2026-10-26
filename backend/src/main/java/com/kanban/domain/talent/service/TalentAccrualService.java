package com.kanban.domain.talent.service;

import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.TalentReason;
import com.kanban.domain.talent.TalentWallet;
import com.kanban.domain.talent.service.TalentLedgerService.Award;
import com.kanban.domain.talent.service.TalentLedgerService.KeyState;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 설교 노트 저장·삭제 → 달란트 적립/상쇄. 계약서 §0 「적립 규칙」.
 *
 * <p>문서마다 "지금 받아야 할 키" 를 계산해 살아 있는 키와 맞춘다(reconcile). 사라진 키는 상쇄, 새 키는 상한 안에서 적립.
 * 노트 date 가 오늘(KST)보다 14일 넘게 지났으면 새로 적립하지 않는다(상쇄는 한다).
 *
 * <p>갈피(bookmarked_at)는 달란트를 주지 않는다(2026-10-26 결정). 예전에 받은 {@code galpi:} 키는 저장 때 건드리지 않고 남겨 두며,
 * 노트를 지우면 그 노트의 다른 키와 함께 상쇄된다.
 *
 * <p>노트 저장과 다른 트랜잭션(REQUIRES_NEW)으로 돈다 — 여기서 실패해도 노트 저장은 이미 끝났다. 호출은 {@link SermonTalentHook}.
 */
@Service
@RequiredArgsConstructor
public class TalentAccrualService {

    public static final int NOTE_AMOUNT = 20;
    public static final int AUDIO_AMOUNT = 5;
    public static final int APPLY_AMOUNT = 3;
    public static final int DONE_AMOUNT = 10;
    public static final int COMPLETE_AMOUNT = 20;

    public static final int NOTE_WEEKLY_CAP = 3;
    public static final int DONE_WEEKLY_CAP = 5;
    public static final int APPLY_PER_NOTE = 2;
    public static final int NOTE_MAX_AGE_DAYS = 14;

    /** 연속 주 → 보너스 */
    public static final Map<Integer, Integer> STREAK_BONUS = Map.of(4, 50, 12, 150, 52, 500);

    private final TalentLedgerService ledger;
    private final ChallengeClock clock;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSermonDocSaved(String userId, String docId, String docTitle, Map<String, Object> content) {
        TalentWallet wallet = ledger.lockWallet(userId);
        LocalDate week = clock.currentWeek();
        Set<LocalDate> touched = new TreeSet<>();
        touched.add(week);

        SermonNoteFacts facts = SermonNoteFacts.from(content, docTitle);
        Map<String, KeyState> active = ledger.activeBySource(userId, docId);
        Map<String, Award> desired = desiredAwards(userId, docId, facts, active, week);

        for (KeyState s : active.values()) {
            if (desired.containsKey(s.key()) || isLegacyGalpi(s.key())) continue;
            ledger.reverse(wallet, userId, s.key());
            touched.add(s.week());
        }

        if (isFresh(facts.date())) {
            for (Award a : desired.values()) {
                if (active.containsKey(a.key())) continue;
                if (withinCap(userId, week, a.reason())) ledger.award(wallet, a);
            }
        }

        reconcileWeeks(wallet, userId, touched);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onSermonDocDeleted(String userId, String docId) {
        TalentWallet wallet = ledger.lockWallet(userId);
        LocalDate week = clock.currentWeek();
        Set<LocalDate> touched = new TreeSet<>();
        touched.add(week);
        for (KeyState s : ledger.activeBySource(userId, docId).values()) {
            ledger.reverse(wallet, userId, s.key());
            touched.add(s.week());
        }
        reconcileWeeks(wallet, userId, touched);
    }

    // ───────────────── internal ─────────────────

    private Map<String, Award> desiredAwards(
            String userId, String docId, SermonNoteFacts f, Map<String, KeyState> active, LocalDate week) {
        Map<String, Award> out = new LinkedHashMap<>();
        String title = f.title() != null ? f.title() : "설교 노트";

        if (f.qualifiesNote()) {
            out.put(
                    noteKey(docId),
                    award(userId, TalentReason.NOTE, noteKey(docId), NOTE_AMOUNT, docId, "설교 기록 · " + title, week));
        }
        if (f.qualifiesAudio()) {
            String key = "audio:" + docId;
            out.put(key, award(userId, TalentReason.NOTE_AUDIO, key, AUDIO_AMOUNT, docId, "설교 녹음 · " + title, week));
        }

        // 적용 기록: 노트당 2개. 이미 받은 생각을 먼저 유지하고, 남는 자리는 글 순서대로
        List<SermonNoteFacts.Thought> applies = f.thoughts().stream()
                .filter(SermonNoteFacts.Thought::qualifiesApply)
                .sorted(Comparator.comparing(t -> active.containsKey(applyKey(docId, t.id())) ? 0 : 1))
                .limit(APPLY_PER_NOTE)
                .toList();
        for (SermonNoteFacts.Thought t : applies) {
            String key = applyKey(docId, t.id());
            out.put(key, award(userId, TalentReason.APPLY, key, APPLY_AMOUNT, docId, "적용 기록 · " + title, week));
        }

        for (SermonNoteFacts.Thought t : f.thoughts()) {
            if (!t.qualifiesDone()) continue;
            String key = "done:" + docId + ":" + t.id();
            out.put(key, award(userId, TalentReason.APPLY_DONE, key, DONE_AMOUNT, docId, "적용 실천 · " + title, week));
        }

        return out;
    }

    private boolean withinCap(String userId, LocalDate week, String reason) {
        return switch (reason) {
            case TalentReason.NOTE -> ledger.countActive(userId, week, TalentReason.NOTE) < NOTE_WEEKLY_CAP;
            case TalentReason.APPLY_DONE -> ledger.countActive(userId, week, TalentReason.APPLY_DONE) < DONE_WEEKLY_CAP;
            default -> true; // apply 는 노트당 2개로 desired 에서 이미 잘랐다
        };
    }

    /** 한 주 완주(+20)와 연속 기록 보너스를 그 주 상태에 맞춘다 */
    private void reconcileWeeks(TalentWallet wallet, String userId, Set<LocalDate> weeks) {
        TreeSet<LocalDate> noteWeeks = ledger.noteWeeks(userId);
        for (LocalDate w : weeks) {
            String completeKey = "complete:" + w;
            boolean complete = ledger.countActive(userId, w, TalentReason.NOTE) > 0
                    && ledger.countActive(userId, w, TalentReason.APPLY_DONE) > 0;
            if (complete) {
                ledger.award(
                        wallet,
                        award(userId, TalentReason.WEEK_COMPLETE, completeKey, COMPLETE_AMOUNT, null, "한 주 완주", w));
            } else {
                ledger.reverse(wallet, userId, completeKey);
            }

            int streak = TalentLedgerService.streakEndingAt(noteWeeks, w);
            for (Map.Entry<Integer, Integer> e : STREAK_BONUS.entrySet()) {
                String key = "streak:" + e.getKey() + ":" + w;
                if (streak == e.getKey()) {
                    ledger.award(
                            wallet,
                            Award.builder()
                                    .userId(userId)
                                    .reason(TalentReason.STREAK)
                                    .key(key)
                                    .amount(e.getValue())
                                    .label(e.getKey() + "주 연속 설교 기록")
                                    .week(w)
                                    .countsForRank(false)
                                    .build());
                } else {
                    ledger.reverse(wallet, userId, key);
                }
            }
        }
    }

    private boolean isFresh(LocalDate noteDate) {
        return noteDate == null || !noteDate.isBefore(clock.today().minusDays(NOTE_MAX_AGE_DAYS));
    }

    private static Award award(
            String userId, String reason, String key, int amount, String sourceId, String label, LocalDate week) {
        return Award.builder()
                .userId(userId)
                .reason(reason)
                .key(key)
                .amount(amount)
                .sourceId(sourceId)
                .label(label)
                .week(week)
                .countsForRank(true)
                .build();
    }

    private static String noteKey(String docId) {
        return "note:" + docId;
    }

    private static String applyKey(String docId, String thoughtId) {
        return "apply:" + docId + ":" + thoughtId;
    }

    /** 갈피 적립을 없애기 전에 받은 키 — 저장 때 상쇄하지 않는다 */
    private static boolean isLegacyGalpi(String key) {
        return key.startsWith("galpi:");
    }
}
