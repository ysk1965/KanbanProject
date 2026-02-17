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

    // Admin용 메서드
    long countByUserId(String userId);

    @Query("SELECT COUNT(d) FROM DiaryEntry d WHERE d.user.id = :userId AND d.status = :status")
    long countByUserIdAndStatus(@Param("userId") String userId, @Param("status") DiaryStatus status);

    // P2 Analytics: Diary 통계
    @Query("SELECT COUNT(DISTINCT d.user.id) FROM DiaryEntry d WHERE d.createdAt >= :since")
    long countActiveDiaryUsers(@Param("since") java.time.LocalDateTime since);

    @Query(value = "SELECT CAST(created_at AS DATE) as diary_date, COUNT(*) as cnt " +
            "FROM diary_entries WHERE created_at >= :startDate " +
            "GROUP BY CAST(created_at AS DATE) ORDER BY diary_date",
            nativeQuery = true)
    java.util.List<Object[]> getDiaryTrend(@Param("startDate") java.time.LocalDateTime startDate);

    long countByStatus(DiaryStatus status);
}
