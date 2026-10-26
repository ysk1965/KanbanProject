package com.kanban.domain.sermongroup;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SermonGroupRepository extends JpaRepository<SermonGroup, String> {

    Optional<SermonGroup> findByIdAndDeletedAtIsNull(String id);

    Optional<SermonGroup> findByInviteCodeAndDeletedAtIsNull(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    List<SermonGroup> findByIdInAndDeletedAtIsNullOrderByCreatedAtAsc(Collection<String> ids);
}
