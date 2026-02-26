package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOneOnOneActionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgOneOnOneActionItemRepository extends JpaRepository<OrgOneOnOneActionItem, String> {

    @Query("SELECT ai FROM OrgOneOnOneActionItem ai " +
           "JOIN FETCH ai.meeting m " +
           "LEFT JOIN FETCH ai.assignee a LEFT JOIN FETCH a.user " +
           "WHERE m.oneOnOne.id = :oneOnOneId AND m.deletedAt IS NULL AND ai.completed = false " +
           "ORDER BY m.meetingDate DESC, ai.displayOrder ASC")
    List<OrgOneOnOneActionItem> findOpenByOneOnOneId(@Param("oneOnOneId") String oneOnOneId);

    @Query("SELECT ai FROM OrgOneOnOneActionItem ai " +
           "LEFT JOIN FETCH ai.assignee a LEFT JOIN FETCH a.user " +
           "WHERE ai.id = :id")
    Optional<OrgOneOnOneActionItem> findByIdWithAssignee(@Param("id") String id);
}
