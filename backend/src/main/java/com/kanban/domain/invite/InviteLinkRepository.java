package com.kanban.domain.invite;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InviteLinkRepository extends JpaRepository<InviteLink, String> {

    List<InviteLink> findByBoardIdAndIsActiveTrue(String boardId);

    Optional<InviteLink> findByCode(String code);

    Optional<InviteLink> findByCodeAndIsActiveTrue(String code);

    boolean existsByCode(String code);
}
