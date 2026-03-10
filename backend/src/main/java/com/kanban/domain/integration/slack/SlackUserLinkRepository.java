package com.kanban.domain.integration.slack;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SlackUserLinkRepository extends JpaRepository<SlackUserLink, String> {

    Optional<SlackUserLink> findByUserId(String userId);

    Optional<SlackUserLink> findBySlackUserId(String slackUserId);

    boolean existsByUserId(String userId);

    @Query("SELECT l FROM SlackUserLink l WHERE l.user.id IN :userIds")
    List<SlackUserLink> findByUserIdIn(@Param("userIds") List<String> userIds);

    void deleteByUserId(String userId);
}
