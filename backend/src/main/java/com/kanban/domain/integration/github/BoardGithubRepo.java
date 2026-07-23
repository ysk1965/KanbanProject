package com.kanban.domain.integration.github;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * 보드가 보고서에 포함할 저장소 선택. 인증(설치)과 분리된 "대상" 쪽.
 *
 * <p>한 보드가 여러 설치에 걸친 저장소를 고를 수 있으므로 installation을 FK로 들고 있는다.
 */
@Entity
@Table(
    name = "board_github_repos",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_board_github_repo", columnNames = {"board_id", "repo_full_name"}),
    indexes = @Index(name = "idx_board_github_repo_board", columnList = "board_id")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BoardGithubRepo extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "installation_id", nullable = false)
    private GithubInstallation installation;

    /** owner/repo */
    @Column(name = "repo_full_name", nullable = false, length = 200)
    private String repoFullName;

    /** null이면 저장소 기본 브랜치 */
    @Column(name = "branch", length = 200)
    private String branch;

    /** 보고서에서 제외할 작성자 로그인 JSON 배열 (봇 계정 등) */
    @Column(name = "exclude_authors_json", columnDefinition = "TEXT")
    private String excludeAuthorsJson;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public BoardGithubRepo(Board board, GithubInstallation installation, String repoFullName,
                           String branch, String excludeAuthorsJson) {
        this.board = board;
        this.installation = installation;
        this.repoFullName = repoFullName;
        this.branch = branch;
        this.excludeAuthorsJson = excludeAuthorsJson;
        this.active = true;
    }

    public void update(String branch, String excludeAuthorsJson, Boolean active) {
        if (branch != null) this.branch = branch;
        if (excludeAuthorsJson != null) this.excludeAuthorsJson = excludeAuthorsJson;
        if (active != null) this.active = active;
    }
}
