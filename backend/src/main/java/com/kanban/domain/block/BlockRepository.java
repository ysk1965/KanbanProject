package com.kanban.domain.block;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BlockRepository extends JpaRepository<Block, String> {

    @Query("SELECT b FROM Block b LEFT JOIN FETCH b.milestone WHERE b.board.id = :boardId ORDER BY b.position ASC")
    List<Block> findByBoardIdOrderByPositionAsc(@Param("boardId") String boardId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.fixedType = :fixedType")
    Optional<Block> findByBoardIdAndFixedType(@Param("boardId") String boardId, @Param("fixedType") FixedBlockType fixedType);

    @Query("SELECT MAX(b.position) FROM Block b WHERE b.board.id = :boardId")
    Integer findMaxPositionByBoardId(@Param("boardId") String boardId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.type = 'CUSTOM' ORDER BY b.position ASC")
    List<Block> findCustomBlocksByBoardId(@Param("boardId") String boardId);

    int countByBoardId(String boardId);

    // JIRA 미러 컬럼 조회
    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.jiraStatusId = :jiraStatusId")
    Optional<Block> findByBoardIdAndJiraStatusId(@Param("boardId") String boardId, @Param("jiraStatusId") String jiraStatusId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.jiraStatusId IS NOT NULL ORDER BY b.position ASC")
    List<Block> findJiraMirrorBlocksByBoardId(@Param("boardId") String boardId);

    @Query("SELECT COUNT(b) FROM Block b WHERE b.board.id = :boardId AND b.jiraStatusId IS NOT NULL")
    long countJiraMirrorBlocksByBoardId(@Param("boardId") String boardId);

    /**
     * Pessimistic Lock을 사용하여 Block 조회
     * Task 생성 시 position 동시성 문제 방지
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM Block b WHERE b.id = :blockId")
    Optional<Block> findByIdWithLock(@Param("blockId") String blockId);

    @Modifying
    @Query("DELETE FROM Block b WHERE b.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    List<Block> findByMilestoneIdOrderByPositionAsc(String milestoneId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.milestone IS NULL ORDER BY b.position ASC")
    List<Block> findBoardLevelBlocksByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM Block b WHERE b.milestone.id = :milestoneId")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);
}
