package com.kanban.domain.integration.discord;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface DiscordBotConfigRepository extends JpaRepository<DiscordBotConfig, String> {

    Optional<DiscordBotConfig> findByBoardId(String boardId);

    Optional<DiscordBotConfig> findByGuildId(String guildId);

    boolean existsByBoardId(String boardId);

    @Modifying
    @Query("DELETE FROM DiscordBotConfig c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
