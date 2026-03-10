package com.kanban.domain.integration.discord;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DiscordUserLinkRepository extends JpaRepository<DiscordUserLink, String> {

    Optional<DiscordUserLink> findByUserId(String userId);

    Optional<DiscordUserLink> findByDiscordUserId(String discordUserId);

    boolean existsByUserId(String userId);

    @Query("SELECT l FROM DiscordUserLink l WHERE l.user.id IN :userIds")
    List<DiscordUserLink> findByUserIdIn(@Param("userIds") List<String> userIds);

    void deleteByUserId(String userId);
}
