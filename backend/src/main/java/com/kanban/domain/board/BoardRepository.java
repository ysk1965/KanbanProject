package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
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
}
