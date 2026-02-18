package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PersonalHabitRepository extends JpaRepository<PersonalHabit, String> {

    @Query("SELECT h FROM PersonalHabit h WHERE h.user.id = :userId AND h.isActive = true ORDER BY h.position")
    List<PersonalHabit> findActiveByUserId(@Param("userId") String userId);

    @Query("SELECT h FROM PersonalHabit h WHERE h.user.id = :userId ORDER BY h.isActive DESC, h.position")
    List<PersonalHabit> findAllByUserId(@Param("userId") String userId);

    long countByUserIdAndIsActive(String userId, boolean isActive);

    void deleteByUserId(String userId);
}
