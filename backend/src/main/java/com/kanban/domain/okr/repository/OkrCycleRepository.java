package com.kanban.domain.okr.repository;

import com.kanban.domain.okr.OkrCycle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OkrCycleRepository extends JpaRepository<OkrCycle, String> {

    List<OkrCycle> findByOrganizationIdOrderByStartDateDesc(String organizationId);

    Optional<OkrCycle> findByIdAndOrganizationId(String id, String organizationId);
}
