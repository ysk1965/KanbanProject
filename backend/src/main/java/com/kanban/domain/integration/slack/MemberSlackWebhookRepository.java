package com.kanban.domain.integration.slack;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MemberSlackWebhookRepository extends JpaRepository<MemberSlackWebhook, String> {

    Optional<MemberSlackWebhook> findByBoardIdAndUserId(String boardId, String userId);

    List<MemberSlackWebhook> findByBoardId(String boardId);

    @Query("SELECT w FROM MemberSlackWebhook w JOIN FETCH w.user WHERE w.board.id = :boardId AND w.user.id IN :userIds AND w.enabled = true")
    List<MemberSlackWebhook> findByBoardIdAndUserIdInAndEnabledTrue(@Param("boardId") String boardId, @Param("userIds") List<String> userIds);

    @Modifying
    @Query("DELETE FROM MemberSlackWebhook m WHERE m.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
