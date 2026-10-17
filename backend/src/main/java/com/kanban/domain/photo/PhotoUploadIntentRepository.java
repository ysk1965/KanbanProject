package com.kanban.domain.photo;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PhotoUploadIntentRepository extends JpaRepository<PhotoUploadIntent, String> {

    /** 같은 key 로 동시에 confirm 이 들어와도 한 번만 등록되도록 행 잠금 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM PhotoUploadIntent i WHERE i.s3Key = :s3Key")
    Optional<PhotoUploadIntent> findByS3KeyForUpdate(@Param("s3Key") String s3Key);

    @Query("SELECT i FROM PhotoUploadIntent i WHERE i.expiresAt < :now ORDER BY i.expiresAt")
    List<PhotoUploadIntent> findExpired(@Param("now") LocalDateTime now, Pageable pageable);
}
