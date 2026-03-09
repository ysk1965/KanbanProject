package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BoardJoinRequestRepository extends JpaRepository<BoardJoinRequest, String> {

    List<BoardJoinRequest> findByBoardIdAndStatus(String boardId, JoinRequestStatus status);

    boolean existsByBoardIdAndRequesterIdAndStatus(String boardId, String requesterId, JoinRequestStatus status);

    Optional<BoardJoinRequest> findTopByBoardIdAndRequesterIdOrderByCreatedAtDesc(String boardId, String requesterId);

    int countByBoardIdAndStatus(String boardId, JoinRequestStatus status);

    void deleteByBoardId(String boardId);
}
