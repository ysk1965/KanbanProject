package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TagRepository extends JpaRepository<Tag, String> {

    List<Tag> findByBoardId(String boardId);

    Optional<Tag> findByBoardIdAndName(String boardId, String name);

    boolean existsByBoardIdAndName(String boardId, String name);
}
