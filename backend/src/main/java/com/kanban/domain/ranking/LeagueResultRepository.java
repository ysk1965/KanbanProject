package com.kanban.domain.ranking;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LeagueResultRepository extends JpaRepository<LeagueResult, String> {

    boolean existsByWeekAndUserId(LocalDate week, String userId);

    Optional<LeagueResult> findFirstByUserIdOrderByWeekDesc(String userId);
}
