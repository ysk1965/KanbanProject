package com.kanban.domain.sermongroup;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SermonSessionRepository extends JpaRepository<SermonSession, String> {

    Optional<SermonSession> findByGroupIdAndServiceIdAndDate(String groupId, String serviceId, LocalDate date);

    List<SermonSession> findByGroupIdAndDateBetweenOrderByDateAscCreatedAtAsc(
            String groupId, LocalDate from, LocalDate to);
}
