package com.kanban.domain.activity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, String> {

    Page<ActivityLog> findByBoardIdOrderByCreatedAtDesc(String boardId, Pageable pageable);

    @Query("SELECT a FROM ActivityLog a WHERE a.board.id = :boardId AND a.createdAt < :cursor ORDER BY a.createdAt DESC")
    List<ActivityLog> findByBoardIdWithCursor(@Param("boardId") String boardId, @Param("cursor") LocalDateTime cursor, Pageable pageable);

    @Query("SELECT a FROM ActivityLog a WHERE a.board.id = :boardId AND a.targetType = :targetType AND a.targetId = :targetId ORDER BY a.createdAt DESC")
    List<ActivityLog> findByTarget(@Param("boardId") String boardId, @Param("targetType") TargetType targetType, @Param("targetId") String targetId);
}
