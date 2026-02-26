package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOnboardingInstanceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface OrgOnboardingInstanceItemRepository extends JpaRepository<OrgOnboardingInstanceItem, String> {

    @Query("SELECT item FROM OrgOnboardingInstanceItem item " +
           "LEFT JOIN FETCH item.assignee a " +
           "LEFT JOIN FETCH a.user " +
           "LEFT JOIN FETCH item.completedBy " +
           "WHERE item.instance.id = :instanceId " +
           "ORDER BY item.displayOrder ASC")
    List<OrgOnboardingInstanceItem> findByInstanceId(@Param("instanceId") String instanceId);

    @Query("SELECT COUNT(item) FROM OrgOnboardingInstanceItem item " +
           "WHERE item.instance.id = :instanceId AND item.completed = true")
    int countCompletedByInstanceId(@Param("instanceId") String instanceId);
}
