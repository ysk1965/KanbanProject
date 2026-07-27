package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraUserMappingRepository extends JpaRepository<JiraUserMapping, String> {

    @Query("SELECT m FROM JiraUserMapping m WHERE m.board.id = :boardId AND m.jiraAccountId = :accountId")
    Optional<JiraUserMapping> findByBoardIdAndJiraAccountId(@Param("boardId") String boardId, @Param("accountId") String accountId);

    /**
     * 멤버로 이어진 매핑만. accountId는 Jira·Confluence가 공유하는 조직 단위 식별자라,
     * Confluence 작성자 해석이 이 결과를 그대로 재사용한다(같은 사람을 두 번 잇지 않는다).
     * 트랜잭션 밖에서 쓰이므로 사용자를 함께 가져온다.
     */
    @Query("SELECT m FROM JiraUserMapping m JOIN FETCH m.bridgeUser "
         + "WHERE m.board.id = :boardId AND m.bridgeUser IS NOT NULL")
    List<JiraUserMapping> findLinkedByBoardId(@Param("boardId") String boardId);

    @Query("SELECT m FROM JiraUserMapping m WHERE m.board.id = :boardId")
    List<JiraUserMapping> findByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM JiraUserMapping m WHERE m.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
