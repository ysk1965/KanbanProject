package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 보드별 JIRA 연동 설정 (보드 1 ↔ JIRA 프로젝트 1, OneToOne).
 *
 * 네 덩어리를 담는다:
 *  ① 대상    - baseUrl, cloudId, projectKey, jql
 *  ② 자격증명 - authType, accountEmail, apiTokenEncrypted(서비스단 암호화), connectedBy
 *  ③ 매핑규칙 - statusToBlockJson, priorityToTagJson, componentToTagJson,
 *             milestoneAutoAssign, writeBackEnabled, writeBackTargetStatusId
 *             (담당자 매핑은 JiraUserMapping 엔티티로 분리)
 *  ④ 진행상태 - status, lastSyncedAt, lastError, active
 *
 * DiscordBotConfig 규약을 따른다: BaseTimeEntity 미사용, 타임스탬프 수동(UTC),
 * Lombok 4종, 세터 없이 도메인 메서드로만 변경.
 */
@Entity
@Table(name = "jira_integration_configs", indexes = {
    @Index(name = "idx_jira_config_board", columnList = "board_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraIntegrationConfig {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false, unique = true)
    private Board board;

    // ① 대상 (OAuth 대기 상태에선 site/project가 아직 미정이라 nullable)
    @Column(name = "base_url", length = 200)
    private String baseUrl;

    @Column(name = "cloud_id", length = 100)
    private String cloudId;

    @Column(name = "project_key", length = 50)
    private String projectKey;

    @Column(name = "jql", length = 1000)
    private String jql;

    // ② 자격증명
    @Enumerated(EnumType.STRING)
    @Column(name = "auth_type", nullable = false, length = 20)
    @Builder.Default
    private JiraAuthType authType = JiraAuthType.API_TOKEN;

    @Column(name = "account_email", length = 200)
    private String accountEmail;

    /**
     * 암호화된 토큰. API_TOKEN이면 Atlassian API 토큰, OAUTH_3LO이면 access token.
     * 서비스단에서 encrypt/decrypt.
     */
    @Column(name = "api_token_encrypted", length = 500)
    private String apiTokenEncrypted;

    /** OAuth refresh token(암호화). offline_access 스코프로 자동 갱신용. */
    @Column(name = "refresh_token_encrypted", length = 500)
    private String refreshTokenEncrypted;

    /** OAuth access token 만료 시각(UTC). 임박 시 refresh token으로 자동 갱신. */
    @Column(name = "token_expires_at")
    private LocalDateTime tokenExpiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "connected_by", nullable = false)
    private User connectedBy;

    // ③ 매핑규칙 (JSON 문자열; 서비스/매퍼에서 파싱)
    @Column(name = "status_to_block_json", columnDefinition = "TEXT")
    private String statusToBlockJson;

    @Column(name = "priority_to_tag_json", columnDefinition = "TEXT")
    private String priorityToTagJson;

    @Column(name = "component_to_tag_json", columnDefinition = "TEXT")
    private String componentToTagJson;

    @Column(name = "milestone_auto_assign", nullable = false)
    @Builder.Default
    private Boolean milestoneAutoAssign = true;

    @Column(name = "write_back_enabled", nullable = false)
    @Builder.Default
    private Boolean writeBackEnabled = false;

    /** 완료 시 전환할 JIRA 대상 상태 id (예 "10007" = "3. 작업 완료"). */
    @Column(name = "write_back_target_status_id", length = 30)
    private String writeBackTargetStatusId;

    // ④ 진행상태
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private JiraConnectionStatus status = JiraConnectionStatus.CONNECTED;

    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 도메인 메서드 ──────────────────────────────

    public void updateConnection(String baseUrl, String cloudId, String projectKey,
                                 JiraAuthType authType, String accountEmail, String apiTokenEncrypted) {
        this.baseUrl = baseUrl;
        this.cloudId = cloudId;
        this.projectKey = projectKey;
        this.authType = authType;
        this.accountEmail = accountEmail;
        if (apiTokenEncrypted != null) {
            this.apiTokenEncrypted = apiTokenEncrypted;
        }
        this.status = JiraConnectionStatus.CONNECTED;
        this.lastError = null;
        this.active = true;
    }

    public void updateJql(String jql) {
        this.jql = jql;
    }

    /** OAuth 토큰 저장/갱신 (콜백·리프레시 공용). authType을 OAUTH_3LO로. */
    public void applyOAuthTokens(String accessTokenEncrypted, String refreshTokenEncrypted, LocalDateTime expiresAt) {
        this.authType = JiraAuthType.OAUTH_3LO;
        this.apiTokenEncrypted = accessTokenEncrypted;
        if (refreshTokenEncrypted != null) {
            this.refreshTokenEncrypted = refreshTokenEncrypted;
        }
        this.tokenExpiresAt = expiresAt;
        this.accountEmail = null; // OAuth는 Bearer 인증 — 이메일 짝 불필요
    }

    /** OAuth 사이트/프로젝트 확정 (사용자가 사이트+프로젝트 선택 후). */
    public void finalizeOAuthTarget(String baseUrl, String cloudId, String projectKey) {
        this.baseUrl = baseUrl;
        this.cloudId = cloudId;
        this.projectKey = projectKey;
        this.status = JiraConnectionStatus.CONNECTED;
        this.active = true;
        this.lastError = null;
    }

    public boolean isOAuth() {
        return this.authType == JiraAuthType.OAUTH_3LO;
    }

    public boolean isTargetFinalized() {
        return this.projectKey != null && !this.projectKey.isBlank()
            && ((isOAuth() && this.cloudId != null) || this.baseUrl != null);
    }

    public void updateMapping(String statusToBlockJson, String priorityToTagJson,
                              String componentToTagJson, boolean milestoneAutoAssign) {
        this.statusToBlockJson = statusToBlockJson;
        this.priorityToTagJson = priorityToTagJson;
        this.componentToTagJson = componentToTagJson;
        this.milestoneAutoAssign = milestoneAutoAssign;
    }

    public void updateWriteBack(boolean enabled, String targetStatusId) {
        this.writeBackEnabled = enabled;
        this.writeBackTargetStatusId = targetStatusId;
    }

    public void markSynced() {
        this.lastSyncedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.status = JiraConnectionStatus.CONNECTED;
        this.lastError = null;
    }

    public void markError(String error) {
        this.status = JiraConnectionStatus.ERROR;
        this.lastError = error != null && error.length() > 500 ? error.substring(0, 500) : error;
    }

    public void deactivate() {
        this.active = false;
        this.status = JiraConnectionStatus.DISCONNECTED;
    }
}
