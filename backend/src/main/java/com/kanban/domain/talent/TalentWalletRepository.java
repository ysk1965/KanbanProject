package com.kanban.domain.talent;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TalentWalletRepository extends JpaRepository<TalentWallet, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM TalentWallet w WHERE w.userId = :userId")
    Optional<TalentWallet> findForUpdate(@Param("userId") String userId);
}
