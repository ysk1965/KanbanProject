package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteDraftArchiveRepository extends JpaRepository<NoteDraftArchive, String> {
}
