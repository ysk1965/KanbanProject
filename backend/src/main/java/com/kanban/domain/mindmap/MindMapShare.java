package com.kanban.domain.mindmap;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 마인드맵 외부 공유 설정 — 보드당 1행.
 * share_code 링크를 가진 누구나 로그인 없이 읽기 전용 스냅샷을 볼 수 있다.
 * 노출 범위(태스크/담당자/메모)는 서버에서 필터링해 내려간다.
 */
@Entity
@Table(name = "mindmap_shares", indexes = {
    @Index(name = "idx_mindmap_share_board", columnList = "board_id"),
    @Index(name = "idx_mindmap_share_code", columnList = "share_code")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MindMapShare extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", nullable = false, length = 36, unique = true)
    private String boardId;

    /** 공개 링크용 짧은 코드(base62 10자). null이면 아직 발급 전 (노트 shareCode 선례와 동일 방식) */
    @Column(name = "share_code", length = 12, unique = true)
    private String shareCode;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private Boolean enabled = false;

    /** 피처 하위 태스크 제목 목록 노출 여부 */
    @Column(name = "show_tasks", nullable = false)
    @Builder.Default
    private Boolean showTasks = true;

    /** 담당자 이름 노출 여부. false면 응답에서 필드 자체를 제거한다 */
    @Column(name = "show_assignees", nullable = false)
    @Builder.Default
    private Boolean showAssignees = false;

    /** 메모 노드 노출 여부 */
    @Column(name = "show_memos", nullable = false)
    @Builder.Default
    private Boolean showMemos = false;

    /** 만료 시각(UTC). null = 무기한. 경과 시 공개 조회는 404 */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    // 짧은 코드용 base62 알파벳 (하이픈 없음 → URL-safe, Note.SHARE_CODE_ALPHABET 선례)
    private static final String SHARE_CODE_ALPHABET =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final java.security.SecureRandom SHARE_CODE_RNG = new java.security.SecureRandom();

    /** 10자 base62(62^10 ≈ 8.4e17) — 충돌 확률은 무시 가능, unique 제약으로 최종 보장. */
    private static String generateShareCode() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(SHARE_CODE_ALPHABET.charAt(SHARE_CODE_RNG.nextInt(SHARE_CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    /** 설정 upsert. enabled로 켜는 순간 코드가 없으면 발급한다. */
    public void updateSettings(boolean enabled, boolean showTasks, boolean showAssignees,
                               boolean showMemos, LocalDateTime expiresAt) {
        this.enabled = enabled;
        this.showTasks = showTasks;
        this.showAssignees = showAssignees;
        this.showMemos = showMemos;
        this.expiresAt = expiresAt;
        if (enabled && this.shareCode == null) {
            this.shareCode = generateShareCode();
        }
    }

    /** 공유를 끄지 않고 코드를 교체. 기존 링크를 가진 사용자는 즉시 차단된다. */
    public void rotateShareCode() {
        this.enabled = true;
        this.shareCode = generateShareCode();
    }
}
