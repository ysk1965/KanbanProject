package com.kanban.domain.contractor.repository;

import com.kanban.domain.contractor.entity.BoardContractor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BoardContractorRepository extends JpaRepository<BoardContractor, String> {

    @Query("SELECT c FROM BoardContractor c WHERE c.board.id = :boardId " +
           "ORDER BY COALESCE(c.displayOrder, 999999) ASC, c.createdAt ASC")
    List<BoardContractor> findAllByBoardIdOrdered(@Param("boardId") String boardId);

    boolean existsByBoardIdAndName(String boardId, String name);

    Optional<BoardContractor> findByIdAndBoardId(String id, String boardId);

    @Query("SELECT c FROM BoardContractor c WHERE c.manager.id = :memberId")
    List<BoardContractor> findAllByManagerId(@Param("memberId") String memberId);

    @Modifying
    @Query("UPDATE BoardContractor c SET c.manager = NULL WHERE c.manager.id = :memberId")
    void clearManagerByMemberId(@Param("memberId") String memberId);
}
