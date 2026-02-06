package com.kanban.domain.inquiry;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InquiryRepository extends JpaRepository<Inquiry, String> {

    @Query("SELECT DISTINCT i FROM Inquiry i " +
           "JOIN FETCH i.user " +
           "LEFT JOIN FETCH i.attachments " +
           "WHERE i.user.id = :userId " +
           "ORDER BY i.createdAt DESC")
    List<Inquiry> findByUserIdWithDetails(@Param("userId") String userId);

    @Query("SELECT DISTINCT i FROM Inquiry i " +
           "JOIN FETCH i.user " +
           "LEFT JOIN FETCH i.attachments " +
           "WHERE i.id = :id")
    Optional<Inquiry> findByIdWithDetails(@Param("id") String id);

    @Query("SELECT i FROM Inquiry i JOIN FETCH i.user WHERE i.status = :status ORDER BY i.createdAt DESC")
    List<Inquiry> findByStatusWithUser(@Param("status") InquiryStatus status);

    @Query(value = "SELECT i FROM Inquiry i JOIN FETCH i.user ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i")
    Page<Inquiry> findAllWithUser(Pageable pageable);

    @Query(value = "SELECT i FROM Inquiry i JOIN FETCH i.user WHERE i.status = :status ORDER BY i.createdAt DESC",
           countQuery = "SELECT COUNT(i) FROM Inquiry i WHERE i.status = :status")
    Page<Inquiry> findByStatusWithUser(@Param("status") InquiryStatus status, Pageable pageable);

    long countByStatus(InquiryStatus status);

    int countByUserIdAndHasNewReplyTrue(String userId);
}
