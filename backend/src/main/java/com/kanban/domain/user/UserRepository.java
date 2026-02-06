package com.kanban.domain.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.Modifying;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<User> findByAuthProviderAndAuthProviderId(String authProvider, String authProviderId);

    // Admin용 메서드
    Page<User> findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
            String name, String email, Pageable pageable);

    @Query("SELECT COUNT(u) FROM User u WHERE u.lastActiveAt >= :since")
    long countActiveUsers(@Param("since") LocalDateTime since);

    // Analytics: 일별 가입자 추이
    @Query(value = "SELECT CAST(created_at AS DATE) as signup_date, COUNT(*) as cnt, " +
            "SUM(CASE WHEN auth_provider = 'email' THEN 1 ELSE 0 END) as email_cnt, " +
            "SUM(CASE WHEN auth_provider = 'GOOGLE' THEN 1 ELSE 0 END) as google_cnt " +
            "FROM users WHERE created_at >= :startDate " +
            "GROUP BY CAST(created_at AS DATE) ORDER BY signup_date",
            nativeQuery = true)
    List<Object[]> getSignupTrendDaily(@Param("startDate") LocalDateTime startDate);

    @Modifying
    @Query("UPDATE User u SET u.lastActiveAt = :now WHERE u.id = :userId")
    void updateLastActiveAt(@Param("userId") String userId, @Param("now") LocalDateTime now);

    // Analytics: DAU 추이
    @Query(value = "SELECT CAST(last_active_at AS DATE) as active_date, COUNT(DISTINCT id) as cnt " +
            "FROM users WHERE last_active_at >= :startDate " +
            "GROUP BY CAST(last_active_at AS DATE) ORDER BY active_date",
            nativeQuery = true)
    List<Object[]> getDailyActiveUserTrend(@Param("startDate") LocalDateTime startDate);
}
