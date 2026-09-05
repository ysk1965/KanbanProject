package com.kanban.domain.imagevote;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ImageVoteBallotRepository extends JpaRepository<ImageVoteBallot, String> {
    Optional<ImageVoteBallot> findByVoteIdAndVoterKey(String voteId, String voterKey);

    List<ImageVoteBallot> findByVoteId(String voteId);

    long countByVoteId(String voteId);
}
