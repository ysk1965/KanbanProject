package com.kanban.domain.diary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DiaryEntryRepository extends JpaRepository<DiaryEntry, String> {

    @Query("SELECT d FROM DiaryEntry d WHERE d.user.id = :userId AND d.diaryDate = :date")
    Optional<DiaryEntry> findByUserIdAndDate(@Param("userId") String userId, @Param("date") LocalDate date);

    @Query("SELECT d FROM DiaryEntry d WHERE d.user.id = :userId AND d.diaryDate BETWEEN :startDate AND :endDate ORDER BY d.diaryDate DESC")
    List<DiaryEntry> findByUserIdAndDateRange(@Param("userId") String userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    boolean existsByUserIdAndDiaryDate(String userId, LocalDate diaryDate);

    void deleteByUserId(String userId);
}
