package com.kanban.domain.monitoring.repository;

import com.kanban.domain.monitoring.entity.ApiMetricSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ApiMetricSnapshotRepository extends JpaRepository<ApiMetricSnapshot, String> {

    List<ApiMetricSnapshot> findBySnapshotTimeBetweenOrderBySnapshotTimeAsc(LocalDateTime start, LocalDateTime end);

    List<ApiMetricSnapshot> findTop10BySnapshotTimeBetweenOrderByAvgResponseMsDesc(LocalDateTime start, LocalDateTime end);

    @Modifying
    @Query("DELETE FROM ApiMetricSnapshot a WHERE a.snapshotTime < :threshold")
    void deleteOlderThan(@Param("threshold") LocalDateTime threshold);
}
