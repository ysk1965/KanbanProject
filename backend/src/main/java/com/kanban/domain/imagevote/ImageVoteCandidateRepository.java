package com.kanban.domain.imagevote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ImageVoteCandidateRepository extends JpaRepository<ImageVoteCandidate, String> {
    List<ImageVoteCandidate> findByVoteIdOrderByPositionAsc(String voteId);
}
