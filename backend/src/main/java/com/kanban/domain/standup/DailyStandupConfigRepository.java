package com.kanban.domain.standup;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DailyStandupConfigRepository extends JpaRepository<DailyStandupConfig, String> {

    Optional<DailyStandupConfig> findByBoardId(String boardId);

    @Query("SELECT c FROM DailyStandupConfig c " +
           "JOIN FETCH c.board b " +
           "WHERE c.enabled = true " +
           "AND c.sendHourUtc = :hour " +
           "AND c.sendMinuteUtc = :minute")
    List<DailyStandupConfig> findEnabledByUtcTime(
            @Param("hour") int hour, @Param("minute") int minute);

    void deleteByBoardId(String boardId);
}
