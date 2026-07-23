package com.kanban.domain.integration.github;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BoardGithubRepoRepository extends JpaRepository<BoardGithubRepo, String> {

    List<BoardGithubRepo> findByBoardIdAndActiveTrue(String boardId);

    List<BoardGithubRepo> findByBoardId(String boardId);

    Optional<BoardGithubRepo> findByBoardIdAndRepoFullName(String boardId, String repoFullName);

    void deleteByBoardIdAndRepoFullName(String boardId, String repoFullName);
}
