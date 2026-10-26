package com.kanban.domain.pilsa;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PilsaVerseRepository extends JpaRepository<PilsaVerse, String> {

    List<PilsaVerse> findByUserIdAndWeek(String userId, LocalDate week);

    boolean existsByUserIdAndWeekAndBookAndChapterAndVerse(
            String userId, LocalDate week, int book, int chapter, int verse);
}
