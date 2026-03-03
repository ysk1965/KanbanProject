package com.kanban.domain.board;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface BoardRepository extends JpaRepository<Board, String> {

    @Query("SELECT b FROM Board b WHERE b.owner.id = :userId AND b.deletedAt IS NULL")
    List<Board> findByOwnerId(@Param("userId") String userId);

    @Query("SELECT b FROM Board b LEFT JOIN FETCH b.organization JOIN BoardMember bm ON b.id = bm.board.id WHERE bm.user.id = :userId AND b.deletedAt IS NULL")
    List<Board> findByMemberId(@Param("userId") String userId);

    @Query("SELECT b FROM Board b WHERE b.name = :name AND b.deletedAt IS NULL")
    Optional<Board> findActiveByName(@Param("name") String name);

    @Query("SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END FROM Board b WHERE b.owner.id = :ownerId AND b.boardType = :boardType AND b.deletedAt IS NULL")
    boolean existsByOwnerIdAndBoardType(@Param("ownerId") String ownerId, @Param("boardType") BoardType boardType);

    @Query("SELECT b FROM Board b WHERE b.owner.id = :ownerId AND b.boardType = :boardType AND b.deletedAt IS NULL")
    Optional<Board> findByOwnerIdAndBoardType(@Param("ownerId") String ownerId, @Param("boardType") BoardType boardType);

    /**
     * Pessimistic Lock을 사용하여 Board 조회
     * Task 제한 검증 시 동시성 문제 방지
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM Board b WHERE b.id = :boardId")
    Optional<Board> findByIdWithLock(@Param("boardId") String boardId);

    /**
     * 활성 보드만 조회 (deletedAt IS NULL)
     */
    @Query("SELECT b FROM Board b WHERE b.id = :boardId AND b.deletedAt IS NULL")
    Optional<Board> findActiveById(@Param("boardId") String boardId);

    // Admin용 메서드: 활성 보드만
    @Query("SELECT b FROM Board b WHERE b.deletedAt IS NULL AND " +
           "(:search IS NULL OR :search = '' OR b.name LIKE %:search% OR b.description LIKE %:search%) AND " +
           "(:tier IS NULL OR b.tier = :tier) AND " +
           "(:boardType IS NULL OR b.boardType = :boardType)")
    Page<Board> findAllWithFilters(
            @Param("search") String search,
            @Param("tier") BoardTier tier,
            @Param("boardType") BoardType boardType,
            Pageable pageable);

    // Admin용 메서드: 삭제된 보드만
    @Query("SELECT b FROM Board b WHERE b.deletedAt IS NOT NULL AND " +
           "(:search IS NULL OR :search = '' OR b.name LIKE %:search% OR b.description LIKE %:search%)")
    Page<Board> findDeletedWithFilters(
            @Param("search") String search,
            Pageable pageable);

    @Query("SELECT COUNT(b) FROM Board b WHERE b.deletedAt IS NULL AND b.tier = :tier")
    long countByTier(@Param("tier") BoardTier tier);

    @Query("SELECT b.tier, COUNT(b) FROM Board b WHERE b.deletedAt IS NULL GROUP BY b.tier")
    List<Object[]> countGroupedByTier();

    /**
     * 사용자가 소속된 보드 수 (owner + member, 활성 보드만)
     */
    @Query("SELECT COUNT(DISTINCT b) FROM Board b " +
           "LEFT JOIN BoardMember bm ON b.id = bm.board.id " +
           "WHERE b.deletedAt IS NULL AND (b.owner.id = :userId OR bm.user.id = :userId)")
    int countByUserInvolvement(@Param("userId") String userId);

    /**
     * 여러 사용자의 소속 보드 수를 배치 조회 (N+1 방지, 활성 보드만)
     */
    @Query("SELECT u.id, COUNT(DISTINCT b.id) FROM User u " +
           "LEFT JOIN Board b ON b.owner.id = u.id AND b.deletedAt IS NULL " +
           "LEFT JOIN BoardMember bm ON bm.user.id = u.id AND bm.board.deletedAt IS NULL " +
           "WHERE u.id IN :userIds " +
           "GROUP BY u.id")
    List<Object[]> countByUserInvolvementBatch(@Param("userIds") List<String> userIds);

    /**
     * 사용자가 소속된 보드 목록 (owner + member, 활성 보드만)
     */
    @Query("SELECT DISTINCT b FROM Board b " +
           "LEFT JOIN BoardMember bm ON b.id = bm.board.id " +
           "WHERE b.deletedAt IS NULL AND (b.owner.id = :userId OR bm.user.id = :userId)")
    List<Board> findByUserInvolvement(@Param("userId") String userId);

    // Personal Board Admin 메서드
    @Query("SELECT COUNT(b) FROM Board b WHERE b.deletedAt IS NULL AND b.boardType = :boardType")
    long countByBoardType(@Param("boardType") BoardType boardType);

    /**
     * 조직 소속 보드 조회
     */
    @Query("SELECT b FROM Board b WHERE b.organization.id = :orgId AND b.deletedAt IS NULL")
    List<Board> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT COUNT(b) FROM Board b WHERE b.organization.id = :orgId AND b.deletedAt IS NULL")
    int countByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT b.organization.id, COUNT(b) FROM Board b " +
           "WHERE b.organization.id IN :orgIds AND b.deletedAt IS NULL GROUP BY b.organization.id")
    List<Object[]> countGroupedByOrgIds(@Param("orgIds") List<String> orgIds);

    /**
     * 스케줄러용: 7일 이상 지난 소프트 삭제 보드 조회
     */
    @Query("SELECT b FROM Board b WHERE b.deletedAt IS NOT NULL AND b.deletedAt < :cutoff")
    List<Board> findExpiredSoftDeleted(@Param("cutoff") LocalDateTime cutoff);

    /**
     * 삭제된 보드 수
     */
    @Query("SELECT COUNT(b) FROM Board b WHERE b.deletedAt IS NOT NULL")
    long countDeleted();

    // Admin Analytics: Personal Conversion
    @Query("SELECT COUNT(DISTINCT b.owner.id) FROM Board b " +
           "WHERE b.boardType = :personalType AND b.deletedAt IS NULL " +
           "AND b.owner.id NOT IN (SELECT DISTINCT bm.user.id FROM BoardMember bm " +
           "WHERE bm.board.boardType = :teamType AND bm.board.deletedAt IS NULL)")
    long countPersonalOnlyUsers(@Param("personalType") BoardType personalType, @Param("teamType") BoardType teamType);

    @Query("SELECT COUNT(DISTINCT b.owner.id) FROM Board b " +
           "WHERE b.boardType = :personalType AND b.deletedAt IS NULL " +
           "AND b.owner.id IN (SELECT DISTINCT bm.user.id FROM BoardMember bm " +
           "WHERE bm.board.boardType = :teamType AND bm.board.deletedAt IS NULL)")
    long countPersonalAndTeamUsers(@Param("personalType") BoardType personalType, @Param("teamType") BoardType teamType);

    @Query(value = "SELECT CAST(bm.joined_at AS DATE) as join_date, COUNT(DISTINCT bm.user_id) as cnt " +
           "FROM board_members bm " +
           "JOIN boards tb ON bm.board_id = tb.id AND tb.board_type = 'TEAM' AND tb.deleted_at IS NULL " +
           "WHERE bm.user_id IN (SELECT DISTINCT pb.owner_id FROM boards pb WHERE pb.board_type = 'PERSONAL' AND pb.deleted_at IS NULL) " +
           "AND bm.joined_at >= :startDate " +
           "GROUP BY CAST(bm.joined_at AS DATE) ORDER BY join_date",
           nativeQuery = true)
    List<Object[]> getPersonalToTeamConversionTrend(@Param("startDate") LocalDateTime startDate);

    /**
     * 조직 소속 활성 보드 ID 목록 조회 (Insights Tab용)
     */
    @Query("SELECT b.id FROM Board b WHERE b.organization.id = :orgId AND b.deletedAt IS NULL")
    List<String> findBoardIdsByOrgId(@Param("orgId") String orgId);
}
