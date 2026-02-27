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

    @Query("SELECT n FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.board.id = :boardId AND n.createdAt < :cursor " +
           "ORDER BY n.createdAt DESC")
    List<Notification> findByRecipientIdAndBoardIdWithCursor(
            @Param("recipientId") String recipientId,
            @Param("boardId") String boardId,
            @Param("cursor") LocalDateTime cursor,
            Pageable pageable);

    @Query("SELECT n FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.board.id = :boardId " +
           "ORDER BY n.createdAt DESC")
    List<Notification> findByRecipientIdAndBoardIdOrderByCreatedAtDesc(
            @Param("recipientId") String recipientId,
            @Param("boardId") String boardId,
            Pageable pageable);

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.readAt IS NULL")
    long countUnreadByRecipientId(@Param("recipientId") String recipientId);

    @Query("SELECT COUNT(n) FROM Notification n " +
           "WHERE n.recipient.id = :recipientId AND n.board.id = :boardId AND n.readAt IS NULL")
    long countUnreadByRecipientIdAndBoardId(
            @Param("recipientId") String recipientId,
            @Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now " +
           "WHERE n.recipient.id = :recipientId AND n.readAt IS NULL")
    int markAllAsRead(@Param("recipientId") String recipientId, @Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE Notification n SET n.readAt = :now " +
           "WHERE n.recipient.id = :recipientId AND n.board.id = :boardId AND n.readAt IS NULL")
    int markAllAsReadByBoard(
            @Param("recipientId") String recipientId,
            @Param("boardId") String boardId,
            @Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.taskId = :taskId")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.recipient.id = :userId")
    void deleteByRecipientId(@Param("userId") String userId);

    @Query("SELECT COUNT(n) > 0 FROM Notification n " +
           "WHERE n.type = :type AND n.senderId = :targetUserId " +
           "AND n.createdAt >= :since")
    boolean existsAnniversaryNotification(
            @Param("type") NotificationType type,
            @Param("targetUserId") String targetUserId,
            @Param("since") LocalDateTime since);

    @Query("SELECT COUNT(n) > 0 FROM Notification n " +
           "WHERE n.type = :type AND n.recipient.id = :recipientUserId " +
           "AND n.senderId = :targetUserId AND n.createdAt >= :since")
    boolean existsAnniversaryNotificationForRecipient(
            @Param("type") NotificationType type,
            @Param("recipientUserId") String recipientUserId,
            @Param("targetUserId") String targetUserId,
            @Param("since") LocalDateTime since);
}
