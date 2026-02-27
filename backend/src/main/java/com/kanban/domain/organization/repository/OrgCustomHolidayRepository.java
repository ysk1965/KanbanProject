package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgCustomHoliday;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface OrgCustomHolidayRepository extends JpaRepository<OrgCustomHoliday, String> {

    @Query("SELECT h FROM OrgCustomHoliday h WHERE h.organization.id = :orgId ORDER BY h.holidayDate ASC")
    List<OrgCustomHoliday> findByOrgId(@Param("orgId") String orgId);

    @Query("SELECT h FROM OrgCustomHoliday h WHERE h.organization.id = :orgId " +
           "AND ((h.recurring = false AND h.holidayDate = :date) " +
           "OR (h.recurring = true AND EXTRACT(MONTH FROM h.holidayDate) = EXTRACT(MONTH FROM CAST(:date AS DATE)) " +
           "AND EXTRACT(DAY FROM h.holidayDate) = EXTRACT(DAY FROM CAST(:date AS DATE))))")
    List<OrgCustomHoliday> findByOrgIdAndDate(@Param("orgId") String orgId, @Param("date") LocalDate date);

    boolean existsByOrganizationIdAndHolidayDate(String organizationId, LocalDate holidayDate);
}
