package com.kanban.domain.integration.discord;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MemberDiscordWebhookRepository extends JpaRepository<MemberDiscordWebhook, String> {

    Optional<MemberDiscordWebhook> findByBoardIdAndUserId(String boardId, String userId);

    List<MemberDiscordWebhook> findByBoardId(String boardId);

    @Query("SELECT w FROM MemberDiscordWebhook w JOIN FETCH w.user WHERE w.board.id = :boardId AND w.user.id IN :userIds AND w.enabled = true")
    List<MemberDiscordWebhook> findByBoardIdAndUserIdInAndEnabledTrue(@Param("boardId") String boardId, @Param("userIds") List<String> userIds);

    @Modifying
    @Query("DELETE FROM MemberDiscordWebhook m WHERE m.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
