package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteTagRepository extends JpaRepository<NoteTag, String> {

    List<NoteTag> findAllByBoardIdOrderByNameAsc(String boardId);

    Optional<NoteTag> findByBoardIdAndName(String boardId, String name);

    boolean existsByBoardIdAndName(String boardId, String name);

    void deleteAllByBoardId(String boardId);
}
