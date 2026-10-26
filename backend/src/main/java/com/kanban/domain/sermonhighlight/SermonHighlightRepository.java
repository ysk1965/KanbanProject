package com.kanban.domain.sermonhighlight;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SermonHighlightRepository extends JpaRepository<SermonHighlight, String> {

    List<SermonHighlight> findByUserIdAndDeletedAtIsNullOrderByBookAscChapterAscVerseFromAsc(String userId);

    long countByUserIdAndDeletedAtIsNull(String userId);
}
