package com.kanban.domain.notification;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, String> {

    @Query("SELECT n FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.createdAt < :cursor " +
           "ORDER BY n.createdAt DESC")
    List<Notification> findByRecipientIdWithCursor(
            @Param("recipientId") String recipientId,
            @Param("cursor") LocalDateTime cursor,
            Pageable pageable);

    @Query("SELECT n FROM Notification n " +
           "WHERE n.recipient.id = :recipientId " +
           "ORDER BY n.createdAt DESC")
    List<Notification> findByRecipientIdOrderByCreatedAtDesc(
            @Param("recipientId") String recipientId,
            Pageable pageable);

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.readAt IS NULL")
    long countUnreadByRecipientId(@Param("recipientId") String recipientId);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now " +
           "WHERE n.recipient.id = :recipientId AND n.readAt IS NULL")
    int markAllAsRead(@Param("recipientId") String recipientId, @Param("now") LocalDateTime now);
}
