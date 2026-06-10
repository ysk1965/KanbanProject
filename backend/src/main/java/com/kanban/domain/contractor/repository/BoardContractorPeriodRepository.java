package com.kanban.domain.contractor.repository;

import com.kanban.domain.contractor.entity.BoardContractorPeriod;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoardContractorPeriodRepository extends JpaRepository<BoardContractorPeriod, String> {

    Optional<BoardContractorPeriod> findByIdAndContractorId(String id, String contractorId);
}
