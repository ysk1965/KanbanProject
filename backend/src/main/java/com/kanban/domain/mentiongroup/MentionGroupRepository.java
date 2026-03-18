package com.kanban.domain.mentiongroup;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MentionGroupRepository extends JpaRepository<MentionGroup, String> {

    @EntityGraph(attributePaths = {"members", "members.user"})
    List<MentionGroup> findByBoardIdOrderByCreatedAtAsc(String boardId);

    boolean existsByBoardIdAndName(String boardId, String name);

    @EntityGraph(attributePaths = {"members", "members.user"})
    Optional<MentionGroup> findByIdAndBoardId(String id, String boardId);
}
