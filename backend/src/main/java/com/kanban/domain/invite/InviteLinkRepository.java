package com.kanban.domain.invite;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InviteLinkRepository extends JpaRepository<InviteLink, String> {

    List<InviteLink> findByBoardIdAndIsActiveTrue(String boardId);

    Optional<InviteLink> findByCode(String code);

    Optional<InviteLink> findByCodeAndIsActiveTrue(String code);

    @Query("SELECT i FROM InviteLink i JOIN FETCH i.board JOIN FETCH i.createdBy WHERE i.code = :code AND i.isActive = true")
    Optional<InviteLink> findByCodeWithBoardAndCreator(@Param("code") String code);

    boolean existsByCode(String code);

    @Modifying
    @Query("DELETE FROM InviteLink i WHERE i.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE InviteLink il SET il.createdBy = null WHERE il.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);
}
