package com.kanban.domain.ranking.service;

import com.kanban.domain.ranking.LeagueMember;
import com.kanban.domain.ranking.LeagueMemberRepository;
import com.kanban.domain.ranking.LeagueResult;
import com.kanban.domain.ranking.LeagueResultRepository;
import com.kanban.domain.ranking.RankingProfile;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.domain.talent.service.TalentLedgerService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** 주간 리그 조회와 마감. 계약서 §6 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeagueService {

    private final LeagueMemberRepository memberRepository;
    private final LeagueResultRepository resultRepository;
    private final LeagueMembershipService membershipService;
    private final RankingService rankingService;
    private final RankingProfileSupport profileSupport;
    private final TalentLedgerService ledgerService;
    private final ChallengeClock clock;
    private final PlatformTransactionManager transactionManager;

    /** 이 호출로도 이번 주 반에 들어간다 */
    @Transactional
    public RankingDto.League get(String userId) {
        LocalDate week = clock.currentWeek();
        ledgerService.lockWallet(userId); // 같은 사용자의 반 배정이 겹치지 않게
        LeagueMember me = membershipService.ensureMember(userId, week);

        List<LeagueMember> cohort =
                memberRepository.findByWeekAndTierAndCohortOrderByCreatedAtAsc(week, me.getTier(), me.getCohort());
        List<RankingService.Candidate> ordered = rankingService.orderLeague(cohort, week);
        int size = ordered.size();
        Map<String, RankingProfile> profiles = profileSupport.byUserIds(
                ordered.stream().map(RankingService.Candidate::userId).toList());

        List<RankingDto.Entry> entries = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            RankingService.Candidate c = ordered.get(i);
            RankingProfile p = profiles.get(c.userId());
            entries.add(RankingDto.Entry.builder()
                    .rank(i + 1)
                    .name(RankingProfileSupport.displayName(p, c.userId()))
                    .anonymous(RankingProfileSupport.isAnonymous(p))
                    .value(c.value())
                    .me(c.userId().equals(userId))
                    .zone(LeagueRules.zone(i + 1, size, c.value(), me.getTier()))
                    .build());
        }

        RankingDto.LastResult last = resultRepository
                .findFirstByUserIdOrderByWeekDesc(userId)
                .map(r -> RankingDto.LastResult.builder()
                        .week(r.getWeek())
                        .rank(r.getFinalRank())
                        .tierFrom(r.getTierFrom())
                        .tierTo(r.getTierTo())
                        .moved(r.getMoved())
                        .build())
                .orElse(null);

        return RankingDto.League.builder()
                .week(week)
                .endsAt(ChallengeClock.weekEnd(week))
                .tier(me.getTier())
                .tierName(LeagueRules.tierName(me.getTier()))
                .promote(LeagueRules.promoteCount(size, me.getTier()))
                .demote(LeagueRules.demoteCount(size, me.getTier()))
                .entries(entries)
                .lastResult(last)
                .build();
    }

    /**
     * 그 주 리그를 마감한다. 반마다 별도 트랜잭션 — 한 반이 실패해도 나머지는 진행. 이미 결과가 있는 사람은 건너뛴다(재실행 안전).
     *
     * @return 결과를 남긴 사람 수
     */
    public int finalizeWeek(LocalDate week) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        List<Object[]> cohorts = tx.execute(s -> memberRepository.findCohorts(week));
        int total = 0;
        for (Object[] row : cohorts == null ? List.<Object[]>of() : cohorts) {
            int tier = ((Number) row[0]).intValue();
            int cohort = ((Number) row[1]).intValue();
            try {
                Integer n = tx.execute(s -> finalizeCohort(week, tier, cohort));
                total += n == null ? 0 : n;
            } catch (Exception e) {
                log.error("League finalize failed - week: {}, tier: {}, cohort: {}", week, tier, cohort, e);
            }
        }
        log.info("League finalized - week: {}, results: {}", week, total);
        return total;
    }

    private int finalizeCohort(LocalDate week, int tier, int cohort) {
        List<LeagueMember> members = memberRepository.findByWeekAndTierAndCohortOrderByCreatedAtAsc(week, tier, cohort);
        List<RankingService.Candidate> ordered = rankingService.orderLeague(members, week);
        int size = ordered.size();
        int written = 0;
        for (int i = 0; i < size; i++) {
            RankingService.Candidate c = ordered.get(i);
            if (resultRepository.existsByWeekAndUserId(week, c.userId())) continue;
            String zone = LeagueRules.zone(i + 1, size, c.value(), tier);
            int to = LeagueRules.tierAfter(zone, tier);
            resultRepository.save(LeagueResult.builder()
                    .week(week)
                    .userId(c.userId())
                    .tier(tier)
                    .cohort(cohort)
                    .finalRank(i + 1)
                    .talents(c.value())
                    .tierFrom(tier)
                    .tierTo(to)
                    .moved(zone)
                    .createdAt(clock.nowUtc())
                    .build());
            profileSupport.getOrCreate(c.userId()).updateLeagueTier(to);
            written++;
        }
        return written;
    }
}
