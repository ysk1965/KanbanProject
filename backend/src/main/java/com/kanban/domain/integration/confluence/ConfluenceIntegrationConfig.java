package com.kanban.domain.integration.confluence;

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
import java.util.UUID;

/**
 * Confluence Cloud 연결. <b>JIRA 연결과 완전히 독립적이다.</b>
 *
 * <p>{@code JiraIntegrationConfig}의 cloudId는 {@code finalizeTarget()}에서 JIRA 사이트로 확정된 값이라,
 * 도메인이 다른 Confluence에 그대로 쓰면 404가 난다. 그래서 자기 토큰·cloudId·baseUrl을 따로 갖는다.
 *
 * <p>같은 Atlassian 계정으로 이미 JIRA를 연결해 뒀고 Confluence 사이트가
 * {@code accessible-resources} 목록에 함께 뜬다면 동의 화면을 건너뛸 수 있지만,
 * 그건 최적화일 뿐 전제가 아니다.
 */
@Entity
// 유일성은 마이그레이션의 부분 유니크 인덱스가 보장한다 (GithubInstallation과 같은 이유).
@Table(
    name = "confluence_integration_configs",
    indexes = {
        @Index(name = "idx_confluence_config_board", columnList = "board_id"),
        @Index(name = "idx_confluence_config_organization", columnList = "organization_id")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ConfluenceIntegrationConfig extends BaseTimeEntity {

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

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_type", nullable = false, length = 20)
    private ConfluenceAuthType authType = ConfluenceAuthType.OAUTH_3LO;

    /** Atlassian 사이트 식별자. JIRA의 cloudId와 다를 수 있다 — 절대 공유하지 않는다. */
    @Column(name = "cloud_id", length = 100)
    private String cloudId;

    /** https://xxx.atlassian.net */
    @Column(name = "base_url", length = 300)
    private String baseUrl;

    @Column(name = "site_name", length = 200)
    private String siteName;

    /** API_TOKEN 방식일 때의 Atlassian 계정 이메일 */
    @Column(name = "account_email", length = 200)
    private String accountEmail;

    @Column(name = "access_token_encrypted", columnDefinition = "TEXT")
    private String accessTokenEncrypted;

    @Column(name = "refresh_token_encrypted", columnDefinition = "TEXT")
    private String refreshTokenEncrypted;

    @Column(name = "token_expires_at")
    private LocalDateTime tokenExpiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "connected_by")
    private User connectedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private IntegrationConnectionStatus status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;

    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

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
    public ConfluenceIntegrationConfig(Board board, Organization organization, IntegrationScope scope,
                                       ConfluenceAuthType authType, User connectedBy) {
        this.board = board;
        this.organization = organization;
        this.scope = scope;
        this.authType = authType != null ? authType : ConfluenceAuthType.OAUTH_3LO;
        this.connectedBy = connectedBy;
        this.status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;
        this.consecutiveFailures = 0;
        this.active = true;
    }

    /** OAuth 콜백·리프레시 공용 */
    public void applyOAuthTokens(String accessTokenEncrypted, String refreshTokenEncrypted,
                                 LocalDateTime expiresAt) {
        this.authType = ConfluenceAuthType.OAUTH_3LO;
        this.accessTokenEncrypted = accessTokenEncrypted;
        if (refreshTokenEncrypted != null) {
            this.refreshTokenEncrypted = refreshTokenEncrypted;
        }
        this.tokenExpiresAt = expiresAt;
        this.active = true;
        this.lastError = null;
        this.consecutiveFailures = 0;
    }

    public void applyApiToken(String accountEmail, String tokenEncrypted, String baseUrl) {
        this.authType = ConfluenceAuthType.API_TOKEN;
        this.accountEmail = accountEmail;
        this.accessTokenEncrypted = tokenEncrypted;
        this.baseUrl = baseUrl;
        this.active = true;
        this.lastError = null;
        this.consecutiveFailures = 0;
    }

    /** 사이트 확정 — 실제 호출로 200을 확인한 뒤에만 부른다. */
    public void applySite(String cloudId, String baseUrl, String siteName) {
        this.cloudId = cloudId;
        this.baseUrl = baseUrl;
        this.siteName = siteName;
    }

    public void markTargetSelected() {
        this.status = IntegrationConnectionStatus.CONNECTED;
        this.lastError = null;
        this.consecutiveFailures = 0;
    }

    /** 볼 스페이스를 전부 해제한 상태 — 연결 자체는 살아 있다. */
    public void markTargetNotSelected() {
        this.status = IntegrationConnectionStatus.TARGET_NOT_SELECTED;
    }

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

    public boolean isOAuth() {
        return this.authType == ConfluenceAuthType.OAUTH_3LO;
    }
}
