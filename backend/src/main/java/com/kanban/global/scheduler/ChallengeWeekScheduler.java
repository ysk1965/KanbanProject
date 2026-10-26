package com.kanban.global.scheduler;

import com.kanban.domain.ranking.service.LeagueService;
import com.kanban.domain.talent.ChallengeClock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 설교 노트 챌린지 주간 리그 마감 — 매주 월요일 00:05 (KST, 제품 규칙 — {@link ChallengeClock}).
 *
 * <p>한 주는 일요일 22:00 KST 에 끝나므로 이 시각엔 지난주 점수가 더 바뀌지 않는다. 결과가 이미 있는 사람은 건너뛰어 재실행해도 안전하다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChallengeWeekScheduler {

    private final LeagueService leagueService;
    private final ChallengeClock clock;

    @Scheduled(cron = "0 5 0 * * MON", zone = ChallengeClock.ZONE_ID)
    @SchedulerLock(name = "ChallengeWeekScheduler.finalizeLeagues", lockAtMostFor = "30m", lockAtLeastFor = "1m")
    public void finalizeLeagues() {
        LocalDate lastWeek = clock.currentWeek().minusWeeks(1);
        try {
            leagueService.finalizeWeek(lastWeek);
        } catch (Exception e) {
            log.error("Challenge league finalize failed - week: {}", lastWeek, e);
        }
    }
}
