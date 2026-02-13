package com.kanban.domain.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, String> {

    Optional<NotificationPreference> findByBoardIdAndUserId(String boardId, String userId);

    @Query("SELECT np FROM NotificationPreference np JOIN FETCH np.user WHERE np.board.id = :boardId AND np.user.id IN :userIds")
    List<NotificationPreference> findByBoardIdAndUserIdIn(@Param("boardId") String boardId, @Param("userIds") List<String> userIds);

    @Modifying
    @Query("DELETE FROM NotificationPreference p WHERE p.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM NotificationPreference p WHERE p.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);
}
