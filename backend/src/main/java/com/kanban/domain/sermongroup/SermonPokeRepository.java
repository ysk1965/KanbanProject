package com.kanban.domain.sermongroup;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SermonPokeRepository extends JpaRepository<SermonPoke, String> {

    boolean existsByGroupIdAndFromUserAndToUserAndWeekStart(
            String groupId, String fromUser, String toUser, LocalDate weekStart);

    List<SermonPoke> findByGroupIdAndToUserAndWeekStartBetweenOrderByCreatedAtAsc(
            String groupId, String toUser, LocalDate from, LocalDate to);
}
