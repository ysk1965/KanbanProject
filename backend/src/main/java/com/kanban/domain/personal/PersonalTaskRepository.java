package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PersonalTaskRepository extends JpaRepository<PersonalTask, String> {

    @Query("SELECT t FROM PersonalTask t LEFT JOIN FETCH t.taskTags tt LEFT JOIN FETCH tt.personalTag " +
            "WHERE t.user.id = :userId AND t.status != 'ARCHIVED' ORDER BY t.status, t.position")
    List<PersonalTask> findByUserIdWithDetails(@Param("userId") String userId);

    @Query("SELECT t FROM PersonalTask t WHERE t.user.id = :userId AND t.status = :status ORDER BY t.position")
    List<PersonalTask> findByUserIdAndStatus(@Param("userId") String userId, @Param("status") PersonalTaskStatus status);

    @Query("SELECT t FROM PersonalTask t WHERE t.user.id = :userId AND t.dueDate = :date AND t.status != 'ARCHIVED' ORDER BY t.priority DESC, t.position")
    List<PersonalTask> findByUserIdAndDueDate(@Param("userId") String userId, @Param("date") LocalDate date);

    @Query("SELECT t FROM PersonalTask t WHERE t.user.id = :userId AND t.dueDate IS NOT NULL AND t.dueDate >= :startDate AND t.dueDate <= :endDate AND t.status != 'ARCHIVED' ORDER BY t.dueDate, t.position")
    List<PersonalTask> findByUserIdAndDueDateBetween(@Param("userId") String userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT t FROM PersonalTask t WHERE t.user.id = :userId AND t.status = 'IN_PROGRESS' ORDER BY t.priority DESC, t.position")
    List<PersonalTask> findInProgressByUserId(@Param("userId") String userId);

    @Query("SELECT DISTINCT t.category FROM PersonalTask t WHERE t.user.id = :userId AND t.category IS NOT NULL ORDER BY t.category")
    List<String> findDistinctCategoriesByUserId(@Param("userId") String userId);

    long countByUserIdAndStatus(String userId, PersonalTaskStatus status);

    @Query("SELECT COUNT(t) FROM PersonalTask t WHERE t.user.id = :userId AND t.status = 'DONE' AND t.completedAt >= :since")
    long countCompletedSince(@Param("userId") String userId, @Param("since") java.time.LocalDateTime since);

    @Query("SELECT COUNT(t) FROM PersonalTask t WHERE t.user.id = :userId AND t.status != 'ARCHIVED'")
    long countActiveByUserId(@Param("userId") String userId);

    void deleteByUserId(String userId);

    @Query("DELETE FROM PersonalTask t WHERE t.status = 'DONE' AND t.completedAt < :cutoff")
    int deleteCompletedBefore(@Param("cutoff") java.time.LocalDateTime cutoff);
}
