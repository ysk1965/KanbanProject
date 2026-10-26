package com.kanban.domain.pilsa;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PilsaPlanRepository extends JpaRepository<PilsaPlan, String> {

    Optional<PilsaPlan> findByUserIdAndWeek(String userId, LocalDate week);
}
