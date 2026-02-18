package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PersonalTaskChecklistRepository extends JpaRepository<PersonalTaskChecklist, String> {

    List<PersonalTaskChecklist> findByPersonalTaskIdOrderByPosition(String personalTaskId);

    int countByPersonalTaskId(String personalTaskId);
}
