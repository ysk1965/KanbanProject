package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PersonalTaskTagRepository extends JpaRepository<PersonalTaskTag, String> {

    Optional<PersonalTaskTag> findByPersonalTaskIdAndPersonalTagId(String personalTaskId, String personalTagId);

    boolean existsByPersonalTaskIdAndPersonalTagId(String personalTaskId, String personalTagId);

    void deleteByPersonalTaskIdAndPersonalTagId(String personalTaskId, String personalTagId);
}
