package com.kanban.domain.user;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {

    Optional<RefreshToken> findByToken(String token);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r WHERE r.token = :token")
    Optional<RefreshToken> findByTokenForUpdate(@Param("token") String token);

    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);

    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.user.id = :userId AND r.token = :token")
    void deleteByUserIdAndToken(@Param("userId") String userId, @Param("token") String token);

    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.expiresAt < :now")
    int deleteExpiredTokens(@Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.user.id = :userId AND r.expiresAt < :now")
    int deleteExpiredTokensByUserId(@Param("userId") String userId, @Param("now") LocalDateTime now);

    @Query("SELECT r FROM RefreshToken r WHERE r.user.id = :userId ORDER BY r.createdAt DESC")
    List<RefreshToken> findAllByUserIdOrderByCreatedAtDesc(@Param("userId") String userId);
}
