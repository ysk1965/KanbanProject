package com.kanban.domain.announcement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface AnnouncementRepository extends JpaRepository<Announcement, String> {

    List<Announcement> findAllByOrderByPriorityDescCreatedAtDesc();

    @Query("SELECT a FROM Announcement a WHERE a.isActive = true " +
            "AND (a.startAt IS NULL OR a.startAt <= :now) " +
            "AND (a.endAt IS NULL OR a.endAt >= :now) " +
            "ORDER BY a.priority DESC, a.createdAt DESC")
    List<Announcement> findActiveAnnouncements(@Param("now") LocalDateTime now);
}
