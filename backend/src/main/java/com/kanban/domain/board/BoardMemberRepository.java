package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardMemberRepository extends JpaRepository<BoardMember, String> {

    List<BoardMember> findByBoardId(String boardId);

    Optional<BoardMember> findByBoardIdAndUserId(String boardId, String userId);

    boolean existsByBoardIdAndUserId(String boardId, String userId);

    @Query("SELECT COUNT(bm) FROM BoardMember bm WHERE bm.board.id = :boardId AND bm.role != 'VIEWER'")
    int countBillableMembers(@Param("boardId") String boardId);

    void deleteByBoardIdAndUserId(String boardId, String userId);
}
