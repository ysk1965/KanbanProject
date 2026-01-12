package com.kanban.domain.milestone;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MilestoneRepository extends JpaRepository<Milestone, String> {

    List<Milestone> findByBoardIdOrderByStartDateAsc(String boardId);

    int countByBoardId(String boardId);
}
