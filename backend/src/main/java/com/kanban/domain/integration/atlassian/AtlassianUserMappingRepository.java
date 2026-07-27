package com.kanban.domain.integration.atlassian;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AtlassianUserMappingRepository extends JpaRepository<AtlassianUserMapping, String> {

    /**
     * 보드의 매핑 전부. 수집 1회당 한 번만 읽어 메모리에서 해결한다 —
     * 문서마다 조회하면 N+1이 된다.
     */
    @Query("SELECT m FROM AtlassianUserMapping m LEFT JOIN FETCH m.bridgeUser WHERE m.board.id = :boardId")
    List<AtlassianUserMapping> findAllByBoardId(@Param("boardId") String boardId);
}
