package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserBoardStarRepository extends JpaRepository<UserBoardStar, String> {

    Optional<UserBoardStar> findByUserIdAndBoardId(String userId, String boardId);

    boolean existsByUserIdAndBoardId(String userId, String boardId);

    void deleteByUserIdAndBoardId(String userId, String boardId);

    @Query("SELECT ubs.board FROM UserBoardStar ubs WHERE ubs.user.id = :userId")
    List<Board> findStarredBoardsByUserId(@Param("userId") String userId);

    /** 사용자가 별표한 보드 id 전체 — getMyBoards 에서 보드별 exists 질의 대신 한 번에 읽는다. */
    @Query("SELECT ubs.board.id FROM UserBoardStar ubs WHERE ubs.user.id = :userId")
    List<String> findStarredBoardIdsByUserId(@Param("userId") String userId);

    @Modifying
    @Query("DELETE FROM UserBoardStar ubs WHERE ubs.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM UserBoardStar ubs WHERE ubs.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);
}
