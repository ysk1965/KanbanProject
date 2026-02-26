package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOneOnOneMeeting;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgOneOnOneMeetingRepository extends JpaRepository<OrgOneOnOneMeeting, String> {

    @Query("SELECT m FROM OrgOneOnOneMeeting m " +
           "JOIN FETCH m.createdBy " +
           "LEFT JOIN FETCH m.actionItems ai " +
           "LEFT JOIN FETCH ai.assignee a LEFT JOIN FETCH a.user " +
           "WHERE m.oneOnOne.id = :oneOnOneId AND m.deletedAt IS NULL " +
           "ORDER BY m.meetingDate DESC, m.createdAt DESC")
    List<OrgOneOnOneMeeting> findByOneOnOneId(@Param("oneOnOneId") String oneOnOneId, Pageable pageable);

    @Query("SELECT m FROM OrgOneOnOneMeeting m " +
           "JOIN FETCH m.createdBy " +
           "LEFT JOIN FETCH m.actionItems ai " +
           "LEFT JOIN FETCH ai.assignee a LEFT JOIN FETCH a.user " +
           "WHERE m.oneOnOne.id = :oneOnOneId AND m.deletedAt IS NULL " +
           "AND (m.meetingDate < (SELECT m2.meetingDate FROM OrgOneOnOneMeeting m2 WHERE m2.id = :cursor) " +
           "     OR (m.meetingDate = (SELECT m2.meetingDate FROM OrgOneOnOneMeeting m2 WHERE m2.id = :cursor) " +
           "         AND m.createdAt < (SELECT m2.createdAt FROM OrgOneOnOneMeeting m2 WHERE m2.id = :cursor))) " +
           "ORDER BY m.meetingDate DESC, m.createdAt DESC")
    List<OrgOneOnOneMeeting> findByOneOnOneIdWithCursor(@Param("oneOnOneId") String oneOnOneId,
                                                         @Param("cursor") String cursor,
                                                         Pageable pageable);

    @Query("SELECT m FROM OrgOneOnOneMeeting m " +
           "JOIN FETCH m.createdBy " +
           "LEFT JOIN FETCH m.actionItems ai " +
           "LEFT JOIN FETCH ai.assignee a LEFT JOIN FETCH a.user " +
           "WHERE m.id = :id AND m.deletedAt IS NULL")
    Optional<OrgOneOnOneMeeting> findByIdWithDetails(@Param("id") String id);

    @Query("SELECT COUNT(m) FROM OrgOneOnOneMeeting m " +
           "WHERE m.oneOnOne.id = :oneOnOneId AND m.deletedAt IS NULL")
    long countByOneOnOneId(@Param("oneOnOneId") String oneOnOneId);
}
