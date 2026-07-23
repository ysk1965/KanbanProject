package com.kanban.domain.integration.github;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.integration.IntegrationConnectionStatus;
import com.kanban.domain.integration.IntegrationScope;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * GitHub App 설치 기록. {@code SlackInstallation}과 같은 모양으로,
 * board_id / organization_id 중 하나만 채워지고 {@link IntegrationScope}가 어느 쪽인지 알려준다.
 *
 * <p>액세스 토큰을 저장하지 않는 것이 이 엔티티의 핵심이다. GitHub App의 installation token은
 * 1시간 만료라 앱 private key로 서명한 JWT로 매번 새로 발급받는다 — 리프레시 토큰 관리가 없다.
 */
@Entity
// 유일성은 마이그레이션의 부분 유니크 인덱스(board_id / organization_id IS NOT NULL)가 보장한다.
// @UniqueConstraint로 선언하면 ddl-auto=update가 같은 이름의 제약을 또 만들려다 충돌한다.
@Table(
    name = "github_installations",
    indexes = {
        @Index(name = "idx_github_install_board", columnList = "board_id"),
        @Index(name = "idx_github_install_organization", columnList = "organization_id")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GithubInstallation extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id")
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 20)
    private IntegrationScope scope;

    /** GitHub이 발급한 설치 ID. 토큰 발급 시 {@code /app/installations/{id}/access_tokens}에 쓴다. */
    @Column(name = "installation_id", nullable = false, length = 40)
    private String installationId;

    /** 설치 대상 계정(조직 또는 개인) 로그인명 */
    @Column(name = "account_login", nullable = false, length = 100)
    private String accountLogin;

    /** Organization | User */
    @Column(name = "account_type", length = 20)
    private String accountType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "installed_by")
    private User installedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private IntegrationConnectionStatus status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    /** 연속 수집 실패 횟수. 3회가 되면 active를 내린다. */
    @Column(name = "consecutive_failures", nullable = false)
    private Integer consecutiveFailures = 0;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public GithubInstallation(Board board, Organization organization, IntegrationScope scope,
                              String installationId, String accountLogin, String accountType,
                              User installedBy) {
        this.board = board;
        this.organization = organization;
        this.scope = scope;
        this.installationId = installationId;
        this.accountLogin = accountLogin;
        this.accountType = accountType;
        this.installedBy = installedBy;
        this.status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;
        this.consecutiveFailures = 0;
        this.active = true;
    }

    /** 같은 설치를 다시 붙일 때 재사용 (uk 위반 방지) */
    public void reinstall(String accountLogin, String accountType, User installedBy) {
        this.accountLogin = accountLogin;
        this.accountType = accountType;
        this.installedBy = installedBy;
        this.active = true;
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;
    }

    public void markTargetSelected() {
        this.status = IntegrationConnectionStatus.CONNECTED;
        this.lastError = null;
        this.consecutiveFailures = 0;
    }

    /** 볼 저장소를 전부 해제한 상태 — 연결 자체는 살아 있다. */
    public void markTargetNotSelected() {
        this.status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;
    }

    /** 수집 실패 기록. 연속 3회면 자동 비활성화한다. */
    public void markFailure(String error) {
        this.lastError = error;
        this.consecutiveFailures = (this.consecutiveFailures == null ? 0 : this.consecutiveFailures) + 1;
        this.status = IntegrationConnectionStatus.DISCONNECTED;
        if (this.consecutiveFailures >= 3) {
            this.active = false;
        }
    }

    public void markSuccess() {
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.status = IntegrationConnectionStatus.CONNECTED;
    }

    public void deactivate() {
        this.active = false;
    }

    public LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }
}
