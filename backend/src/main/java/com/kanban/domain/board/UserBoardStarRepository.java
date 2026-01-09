package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
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
}
