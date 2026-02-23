package com.kanban.domain.diary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DiaryMessageRepository extends JpaRepository<DiaryMessage, String> {

    @Query("SELECT m FROM DiaryMessage m WHERE m.diary.id = :diaryId ORDER BY m.messageOrder ASC")
    List<DiaryMessage> findByDiaryIdOrderByMessageOrder(@Param("diaryId") String diaryId);

    @Query("SELECT COALESCE(MAX(m.messageOrder), 0) FROM DiaryMessage m WHERE m.diary.id = :diaryId")
    int findMaxMessageOrder(@Param("diaryId") String diaryId);
}
