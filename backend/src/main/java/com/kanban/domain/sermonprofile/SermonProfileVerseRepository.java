package com.kanban.domain.sermonprofile;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SermonProfileVerseRepository extends JpaRepository<SermonProfileVerse, String> {

    List<SermonProfileVerse> findTop12ByUserIdOrderByFromAtDesc(String userId);

    Optional<SermonProfileVerse> findFirstByUserIdAndToAtIsNull(String userId);

    long countByUserId(String userId);
}
