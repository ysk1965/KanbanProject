package com.kanban.domain.ranking.service;

import com.kanban.domain.ranking.LeagueMember;
import com.kanban.domain.ranking.LeagueMemberRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 리그 반 배정. 같은 티어 반을 30명까지 채우고 넘치면 새 반을 연다.
 *
 * <p>호출하는 쪽이 사용자 지갑 잠금을 쥔 상태여야 한다(같은 사용자의 중복 배정 방지).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class LeagueMembershipService {

    private final LeagueMemberRepository memberRepository;
    private final RankingProfileSupport profileSupport;

    public LeagueMember ensureMember(String userId, LocalDate week) {
        return memberRepository.findByWeekAndUserId(week, userId).orElseGet(() -> {
            int tier = profileSupport.getOrCreate(userId).getLeagueTier();
            Integer max = memberRepository.maxCohort(week, tier);
            int cohort;
            if (max == null) {
                cohort = 1;
            } else {
                cohort = memberRepository.countByWeekAndTierAndCohort(week, tier, max) < LeagueRules.COHORT_SIZE
                        ? max
                        : max + 1;
            }
            return memberRepository.save(LeagueMember.builder()
                    .week(week)
                    .userId(userId)
                    .tier(tier)
                    .cohort(cohort)
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .build());
        });
    }
}
