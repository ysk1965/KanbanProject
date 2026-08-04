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
    @Column(name = "api_token_encrypted", columnDefinition = "TEXT")
    private String apiTokenEncrypted;

    /** OAuth refresh token(암호화). offline_access 스코프로 자동 갱신용. */
    @Column(name = "refresh_token_encrypted", columnDefinition = "TEXT")
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

    /**
     * 블록 ↔ JIRA status 양방향 매핑 (JSON). key=blockId 또는 특수키(__rejected),
     * value={ jira_status_id, dir(push|pull), qa(REVIEW|VERIFIED), return_block_id }.
     * push=BRIDGE→JIRA(개발 소유), pull=JIRA→BRIDGE 읽기전용(QA 소유). {@code statusToBlockJson}을 대체·확장.
     */
    @Column(name = "block_status_map_json", columnDefinition = "TEXT")
    private String blockStatusMapJson;

    /**
     * 동기화 방식. MIRROR=JIRA 상태를 블록에 1:1 미러링(신규 기본), MANUAL=블록별 수동 매핑(레거시).
     * 기존 config는 MANUAL로 유지되어 하위 호환. 미러 셋업 시 MIRROR로 전환.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "sync_mode", nullable = false, length = 20)
    @Builder.Default
    private JiraSyncMode syncMode = JiraSyncMode.MANUAL;

    /**
     * 미러 컬럼 정의 (JSON). JIRA Agile 보드 컬럼을 그대로 미러링.
     * [{ "block_id":"...", "name":"완료", "status_ids":["10004","10007"], "primary":"10004" }]
     * 한 컬럼이 여러 JIRA 상태를 묶을 수 있다(완료=완료+Resolved 등). pull은 status_ids로 배치, push는 primary로 전환.
     */
    @Column(name = "mirror_columns_json", columnDefinition = "TEXT")
    private String mirrorColumnsJson;

    /**
     * 미러 대상으로 선택한 JIRA Agile 보드 id. 프로젝트에 보드가 여러 개일 때
     * (예: "현재 QA 보드" vs "잔존 이슈 보드") 어느 보드의 컬럼 구성을 미러링할지 확정.
     * null이면 자동 선택(첫 kanban 보드). 사용자가 패널에서 고르면 저장.
     */
    @Column(name = "agile_board_id", length = 30)
    private String agileBoardId;

    @Column(name = "milestone_auto_assign", nullable = false)
    @Builder.Default
    private Boolean milestoneAutoAssign = true;

    @Column(name = "write_back_enabled", nullable = false)
    @Builder.Default
    private Boolean writeBackEnabled = false;

    /** 완료 시 전환할 JIRA 대상 상태 id (예 "10007" = "3. 작업 완료"). */
    @Column(name = "write_back_target_status_id", length = 30)
    private String writeBackTargetStatusId;

    /**
     * 댓글 양방향 동기화 사용 여부. BRIDGE 댓글 ↔ JIRA 코멘트 생성/삭제를 서로 전파한다. 기본 off.
     *
     * <p>JIRA→BRIDGE를 실시간으로 받으려면 JIRA 웹훅/Automation에 코멘트 이벤트
     * ({@code comment_created}, {@code comment_deleted})를 추가해야 한다.
     *
     * <p>웹훅 유실 백업(폴링 대조)은 {@code findAllActivePollable()} 대상 보드에서만 돈다 —
     * 즉 미러 컬럼이나 블록↔status 매핑이 설정된 보드. 둘 다 없는 보드는 웹훅이 유일한 경로다.
     */
    @Column(name = "comment_sync_enabled", nullable = false)
    @Builder.Default
    private Boolean commentSyncEnabled = false;

    /** 웹훅 수신 검증용 보드별 시크릿 토큰(Phase 4). JIRA→BRIDGE 근실시간 pull URL에 포함. */
    @Column(name = "webhook_token", length = 64)
    private String webhookToken;

    /**
     * 연결된 저장소의 자동 검증 기반 수준 — 자동수정 트리아지 판정에 쓴다.
     *
     * <p>기본값이 {@link TestInfraLevel#NONE}인 이유: 테스트가 있다고 잘못 가정하면 실행 불가능한
     * 이슈가 후보로 올라오지만, 없다고 가정하면 후보가 보수적으로 줄 뿐이다. 틀렸을 때 비용이
     * 작은 쪽을 기본으로 둔다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "autofix_test_infra", length = 20)
    @Builder.Default
    private TestInfraLevel autofixTestInfra = TestInfraLevel.NONE;

    /**
     * 자동수정 러너가 결과를 회신할 때 쓰는 보드별 시크릿.
     * {@link #webhookToken}과 분리한다 — 하나를 회전해도 다른 경로가 죽지 않아야 한다.
     */
    @Column(name = "autofix_callback_token", length = 64)
    private String autofixCallbackToken;

    /**
     * 마지막으로 러너가 말을 걸어온 시각(claim 또는 heartbeat).
     *
     * <p>러너가 살아 있는지는 이 값으로만 알 수 있다 — 맥이 잠들거나 데몬이 죽어도 아무도 알려주지
     * 않고, 큐가 그냥 조용해질 뿐이다. 셋업 체크리스트가 "러너 연결됨"을 표시하는 근거이기도 하다.
     */
    @Column(name = "autofix_runner_seen_at")
    private LocalDateTime autofixRunnerSeenAt;

    @Column(name = "autofix_runner_name", length = 100)
    private String autofixRunnerName;

    /**
     * 러너 자가진단 스냅샷(JSON). 맥에 들어가지 않고도 "왜 안 도는지"를 화면이 설명하기 위한 값이다.
     *
     * <p>컬럼 하나로 두는 이유: 러너 환경 점검 항목은 앞으로도 늘어난다. 항목마다 컬럼을 파면
     * 러너 스크립트를 고칠 때마다 마이그레이션이 따라붙는다. 대신 서버가 아는 필드만 뽑아
     * 다시 직렬화해 저장하므로, 러너가 보낸 임의의 값이 그대로 들어오지는 않는다.
     */
    @Column(name = "autofix_runner_status", length = 500)
    private String autofixRunnerStatus;

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

    /** 블록↔status 양방향 매핑(JSON) 저장. null이면 매핑 없음(기본 블록으로 fallback). */
    public void updateBlockStatusMap(String blockStatusMapJson) {
        this.blockStatusMapJson = blockStatusMapJson;
    }

    /** 미러 모드로 전환. JIRA 보드 컬럼을 블록에 미러링. */
    public void enableMirror() {
        this.syncMode = JiraSyncMode.MIRROR;
        this.status = JiraConnectionStatus.CONNECTED;
        this.lastError = null;
    }

    public void updateMirrorColumns(String mirrorColumnsJson) {
        this.mirrorColumnsJson = mirrorColumnsJson;
    }

    /** 미러 대상 Agile 보드 선택(빈 값이면 자동 선택으로 복귀). */
    public void updateAgileBoardId(String agileBoardId) {
        this.agileBoardId = (agileBoardId == null || agileBoardId.isBlank()) ? null : agileBoardId;
    }

    public boolean isMirror() {
        return this.syncMode == JiraSyncMode.MIRROR;
    }

    /** 웹훅 토큰이 없으면 생성해 반환(멱등). */
    public String ensureWebhookToken() {
        if (this.webhookToken == null || this.webhookToken.isBlank()) {
            this.webhookToken = UUID.randomUUID().toString().replace("-", "");
        }
        return this.webhookToken;
    }

    public void updateWriteBack(boolean enabled, String targetStatusId) {
        this.writeBackEnabled = enabled;
        this.writeBackTargetStatusId = targetStatusId;
    }

    public void updateCommentSync(boolean enabled) {
        this.commentSyncEnabled = enabled;
    }

    public boolean isCommentSyncEnabled() {
        return Boolean.TRUE.equals(this.commentSyncEnabled);
    }

    /** 자동수정 콜백 토큰이 없으면 생성해 반환(멱등). */
    public String ensureAutofixCallbackToken() {
        if (this.autofixCallbackToken == null || this.autofixCallbackToken.isBlank()) {
            this.autofixCallbackToken = UUID.randomUUID().toString().replace("-", "");
        }
        return this.autofixCallbackToken;
    }

    public void updateAutofixTestInfra(TestInfraLevel level) {
        this.autofixTestInfra = level != null ? level : TestInfraLevel.NONE;
    }

    /** 기존 행은 컬럼이 null이라 방어한다. */
    public TestInfraLevel resolveAutofixTestInfra() {
        return this.autofixTestInfra != null ? this.autofixTestInfra : TestInfraLevel.NONE;
    }

    /**
     * 러너가 말을 걸어왔다 — claim이든 heartbeat든 살아 있다는 신호는 같다.
     *
     * @param statusJson 자가진단 스냅샷. null이면 직전 값을 지우지 않는다 — 구버전 러너나
     *                   진단 실패가 "정상"으로 보이면 안 되지만, 마지막으로 알던 것까지
     *                   잃으면 화면이 더 말할 게 없어진다.
     */
    public void touchAutofixRunner(String runnerName, String statusJson) {
        this.autofixRunnerSeenAt = LocalDateTime.now(ZoneOffset.UTC);
        if (runnerName != null && !runnerName.isBlank()) {
            this.autofixRunnerName = runnerName.length() > 100 ? runnerName.substring(0, 100) : runnerName;
        }
        if (statusJson != null && statusJson.length() <= 500) {
            this.autofixRunnerStatus = statusJson;
        }
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
