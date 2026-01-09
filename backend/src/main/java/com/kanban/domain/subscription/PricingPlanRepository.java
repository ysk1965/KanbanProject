package com.kanban.domain.subscription;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PricingPlanRepository extends JpaRepository<PricingPlan, String> {

    List<PricingPlan> findByIsActiveTrueOrderByMinMembersAsc();

    @Query("SELECT p FROM PricingPlan p WHERE p.isActive = true AND p.minMembers <= :memberCount AND p.maxMembers >= :memberCount")
    Optional<PricingPlan> findPlanForMemberCount(@Param("memberCount") int memberCount);
}
