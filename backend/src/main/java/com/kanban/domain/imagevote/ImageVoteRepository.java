package com.kanban.domain.imagevote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ImageVoteRepository extends JpaRepository<ImageVote, String> {
    Optional<ImageVote> findByToken(String token);
}
