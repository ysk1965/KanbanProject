package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, String> {

    @Query("SELECT DISTINCT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.isDeleted = false ORDER BY n.parent.id NULLS FIRST, n.position ASC")
    List<Note> findAllByBoardIdNotDeleted(@Param("boardId") String boardId);

    @Query("SELECT DISTINCT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.parent IS NULL AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findRootsByBoardId(@Param("boardId") String boardId);

    @Query("SELECT DISTINCT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.parent.id = :parentId AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.id = :id AND n.board.id = :boardId")
    Optional<Note> findByIdAndBoardId(@Param("id") String id, @Param("boardId") String boardId);

    @Query("SELECT COALESCE(MAX(n.position), -1) + 1 FROM Note n WHERE n.board.id = :boardId AND n.parent IS NULL AND n.isDeleted = false")
    int findNextRootPosition(@Param("boardId") String boardId);

    @Query("SELECT COALESCE(MAX(n.position), -1) + 1 FROM Note n WHERE n.parent.id = :parentId AND n.isDeleted = false")
    int findNextChildPosition(@Param("parentId") String parentId);

    @Query("SELECT DISTINCT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.type = 'DOCUMENT' AND n.isDeleted = false ORDER BY n.updatedAt DESC")
    List<Note> findAllDocumentsByBoardId(@Param("boardId") String boardId);

    @Query("SELECT COUNT(n) FROM Note n WHERE n.parent.id = :parentId AND n.isDeleted = false")
    int countChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT DISTINCT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.parent.id IN :parentIds AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findChildrenByParentIds(@Param("parentIds") List<String> parentIds);

    @Query("SELECT n FROM Note n JOIN FETCH n.createdBy JOIN FETCH n.updatedBy WHERE n.shareToken = :shareToken AND n.isShared = true AND n.isDeleted = false")
    Optional<Note> findByShareTokenAndIsSharedTrueAndIsDeletedFalse(@Param("shareToken") String shareToken);

    void deleteAllByBoardId(String boardId);
}
