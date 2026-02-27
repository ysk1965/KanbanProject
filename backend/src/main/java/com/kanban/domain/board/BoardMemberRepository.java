package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardMemberRepository extends JpaRepository<BoardMember, String> {

    @Query("SELECT bm FROM BoardMember bm JOIN FETCH bm.user WHERE bm.board.id = :boardId ORDER BY COALESCE(bm.displayOrder, 999999) ASC, bm.joinedAt ASC")
    List<BoardMember> findByBoardId(@Param("boardId") String boardId);

    Optional<BoardMember> findByBoardIdAndUserId(String boardId, String userId);

    boolean existsByBoardIdAndUserId(String boardId, String userId);

    @Query("SELECT COUNT(bm) FROM BoardMember bm WHERE bm.board.id = :boardId AND bm.role != 'VIEWER'")
    int countBillableMembers(@Param("boardId") String boardId);

    void deleteByBoardIdAndUserId(String boardId, String userId);

    /**
     * 보드의 멤버를 최대 limit명까지 가입일 순으로 조회 (대시보드 미리보기용)
     */
    @Query("SELECT bm FROM BoardMember bm JOIN FETCH bm.user WHERE bm.board.id = :boardId ORDER BY bm.joinedAt ASC LIMIT :limit")
    List<BoardMember> findTopMembersByBoardId(@Param("boardId") String boardId, @Param("limit") int limit);

    long countByBoardId(String boardId);

    /**
     * 여러 보드의 멤버 수 일괄 조회 (N+1 방지)
     */
    @Query("SELECT bm.board.id, COUNT(bm) FROM BoardMember bm WHERE bm.board.id IN :boardIds GROUP BY bm.board.id")
    List<Object[]> countGroupedByBoardId(@Param("boardIds") List<String> boardIds);

    /**
     * 해당 사용자가 OWNER인 보드가 있는지 확인 (계정 탈퇴 시 사용)
     */
    boolean existsByUserIdAndRole(String userId, BoardRole role);

    /**
     * 해당 사용자의 모든 멤버십 삭제 (계정 탈퇴 시 사용)
     */
    void deleteByUserId(String userId);

    @Modifying
    @Query("DELETE FROM BoardMember bm WHERE bm.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE BoardMember bm SET bm.invitedBy = null WHERE bm.invitedBy.id = :userId")
    void nullifyInvitedByUserId(@Param("userId") String userId);

    // ==================== Cross-Domain Integration Queries ====================

    /**
     * 유저가 멤버인 모든 보드의 BoardMember 조회 (삭제된 보드 제외)
     */
    @Query("SELECT bm FROM BoardMember bm JOIN FETCH bm.board b JOIN FETCH bm.user WHERE bm.user.id = :userId AND b.deletedAt IS NULL")
    List<BoardMember> findByUserIdWithActiveBoards(@Param("userId") String userId);
}
