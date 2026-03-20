package com.kanban.domain.milestone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface MilestoneBlockConfigRepository extends JpaRepository<MilestoneBlockConfig, String> {
    List<MilestoneBlockConfig> findByMilestoneId(String milestoneId);

    Optional<MilestoneBlockConfig> findByMilestoneIdAndBlockId(String milestoneId, String blockId);

    @Query("SELECT mbc.block.id FROM MilestoneBlockConfig mbc WHERE mbc.milestone.id = :milestoneId AND mbc.hidden = true")
    Set<String> findHiddenBlockIdsByMilestoneId(@Param("milestoneId") String milestoneId);

    @Modifying
    @Query("DELETE FROM MilestoneBlockConfig mbc WHERE mbc.milestone.id = :milestoneId")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);

    @Modifying
    @Query("DELETE FROM MilestoneBlockConfig mbc WHERE mbc.block.id = :blockId")
    void deleteByBlockId(@Param("blockId") String blockId);
}
