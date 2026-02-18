package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonalTagRepository extends JpaRepository<PersonalTag, String> {

    List<PersonalTag> findByUserIdOrderByNameAsc(String userId);

    Optional<PersonalTag> findByUserIdAndName(String userId, String name);

    boolean existsByUserIdAndName(String userId, String name);

    void deleteByUserId(String userId);
}
