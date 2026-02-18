package com.kanban.domain.board;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardRepository extends JpaRepository<Board, String> {

    @Query("SELECT b FROM Board b WHERE b.owner.id = :userId")
    List<Board> findByOwnerId(@Param("userId") String userId);

    @Query("SELECT b FROM Board b JOIN BoardMember bm ON b.id = bm.board.id WHERE bm.user.id = :userId")
    List<Board> findByMemberId(@Param("userId") String userId);

    Optional<Board> findByName(String name);

    boolean existsByOwnerIdAndBoardType(String ownerId, BoardType boardType);

    Optional<Board> findByOwnerIdAndBoardType(String ownerId, BoardType boardType);

    /**
     * Pessimistic Lock을 사용하여 Board 조회
     * Task 제한 검증 시 동시성 문제 방지
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM Board b WHERE b.id = :boardId")
    Optional<Board> findByIdWithLock(@Param("boardId") String boardId);

    // Admin용 메서드
    @Query("SELECT b FROM Board b WHERE " +
           "(:search IS NULL OR :search = '' OR b.name LIKE %:search% OR b.description LIKE %:search%) AND " +
           "(:tier IS NULL OR b.tier = :tier) AND " +
           "(:boardType IS NULL OR b.boardType = :boardType)")
    Page<Board> findAllWithFilters(
            @Param("search") String search,
            @Param("tier") BoardTier tier,
            @Param("boardType") BoardType boardType,
            Pageable pageable);

    long countByTier(BoardTier tier);

    @Query("SELECT b.tier, COUNT(b) FROM Board b GROUP BY b.tier")
    List<Object[]> countGroupedByTier();

    /**
     * 사용자가 소속된 보드 수 (owner + member)
     */
    @Query("SELECT COUNT(DISTINCT b) FROM Board b " +
           "LEFT JOIN BoardMember bm ON b.id = bm.board.id " +
           "WHERE b.owner.id = :userId OR bm.user.id = :userId")
    int countByUserInvolvement(@Param("userId") String userId);

    /**
     * 여러 사용자의 소속 보드 수를 배치 조회 (N+1 방지)
     */
    @Query("SELECT u.id, COUNT(DISTINCT b.id) FROM User u " +
           "LEFT JOIN Board b ON b.owner.id = u.id " +
           "LEFT JOIN BoardMember bm ON bm.user.id = u.id " +
           "WHERE u.id IN :userIds " +
           "GROUP BY u.id")
    List<Object[]> countByUserInvolvementBatch(@Param("userIds") List<String> userIds);

    /**
     * 사용자가 소속된 보드 목록 (owner + member)
     */
    @Query("SELECT DISTINCT b FROM Board b " +
           "LEFT JOIN BoardMember bm ON b.id = bm.board.id " +
           "WHERE b.owner.id = :userId OR bm.user.id = :userId")
    List<Board> findByUserInvolvement(@Param("userId") String userId);

    // Personal Board Admin 메서드
    long countByBoardType(BoardType boardType);
}
