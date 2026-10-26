package com.kanban.domain.ranking.service;

import com.kanban.domain.ranking.WeeklyScore;
import com.kanban.domain.ranking.WeeklyScoreRepository;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * weekly_scores 갱신. 호출하는 쪽이 사용자 지갑 잠금을 쥔 상태라 (week, user) 행 생성이 겹치지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class WeeklyScoreService {

    private final WeeklyScoreRepository repository;

    public void addTalents(String userId, LocalDate week, int amount) {
        if (amount == 0) return;
        getOrCreate(userId, week).addTalents(amount);
    }

    public void offerRain(String userId, LocalDate week, int score) {
        getOrCreate(userId, week).offerRain(score);
    }

    public void offerBooks(String userId, LocalDate week, int ms) {
        getOrCreate(userId, week).offerBooks(ms);
    }

    private WeeklyScore getOrCreate(String userId, LocalDate week) {
        return repository
                .findByWeekAndUserId(week, userId)
                .orElseGet(() -> repository.save(
                        WeeklyScore.builder().week(week).userId(userId).build()));
    }
}
