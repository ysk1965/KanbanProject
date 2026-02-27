package com.kanban.domain.okr.repository;

import com.kanban.domain.okr.OkrCheckIn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OkrCheckInRepository extends JpaRepository<OkrCheckIn, String> {

    @Query("SELECT c FROM OkrCheckIn c " +
           "LEFT JOIN FETCH c.author a " +
           "LEFT JOIN FETCH a.user " +
           "WHERE c.keyResult.id = :keyResultId " +
           "ORDER BY c.createdAt DESC")
    List<OkrCheckIn> findByKeyResultIdWithAuthor(@Param("keyResultId") String keyResultId);

    List<OkrCheckIn> findByKeyResultIdOrderByCreatedAtDesc(String keyResultId);
}
