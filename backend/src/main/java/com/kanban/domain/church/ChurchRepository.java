package com.kanban.domain.church;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChurchRepository extends JpaRepository<Church, String> {

    Optional<Church> findByNameKeyAndRegion(String nameKey, String region);

    @Query(
            "SELECT c FROM Church c WHERE c.nameKey LIKE CONCAT('%', :key, '%') ORDER BY LENGTH(c.nameKey) ASC, c.name ASC")
    List<Church> searchByNameKey(@Param("key") String key, Pageable pageable);
}
