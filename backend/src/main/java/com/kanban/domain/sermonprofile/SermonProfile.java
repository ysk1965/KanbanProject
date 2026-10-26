package com.kanban.domain.sermonprofile;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 설교 노트 「나의 갈피」 이름표 — 캐릭터·잉크·대표 말씀과 고정한 노트(폴라로이드 3장).
 *
 * <p>소속 교회는 여기 두지 않는다 — 챌린지의 user_churches 가 원본(교회 랭킹과 같은 값이어야 해서).
 *
 * <p>pins 는 JSON 한 덩어리 [{note_id, ink, pattern, sticker, line}] — 최대 3개, 순서 = 배열 순서.
 */
@Entity
@Table(name = "sermon_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonProfile {

    @Id
    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "mascot", nullable = false, length = 20)
    private String mascot;

    @Column(name = "mascot_state", nullable = false, length = 20)
    private String mascotState;

    @Column(name = "ink", nullable = false, length = 20)
    private String ink;

    /** encRef ("44:5:3-4") — null = 대표 말씀 없음 */
    @Column(name = "verse_ref", length = 24)
    private String verseRef;

    @Column(name = "verse_style", nullable = false, length = 10)
    private String verseStyle;

    /** private / groups / link */
    @Column(name = "visibility", nullable = false, length = 10)
    private String visibility;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "pins", nullable = false)
    @Builder.Default
    private List<Map<String, Object>> pins = new ArrayList<>();

    /** 자동 갈피(예배 시간에 노트를 열면 그 예배로 갈피를 꽂기) — null = 정한 적 없음 (응답은 true) */
    @Column(name = "galpi_auto")
    private Boolean galpiAuto;

    /** 자동 갈피가 고르는 예배 (클라이언트 예배표 id/이름) — null = 고르지 않음 */
    @Column(name = "galpi_service", length = 60)
    private String galpiService;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    public void update(
            String mascot,
            String mascotState,
            String ink,
            String verseRef,
            String verseStyle,
            String visibility,
            List<Map<String, Object>> pins) {
        this.mascot = mascot;
        this.mascotState = mascotState;
        this.ink = ink;
        this.verseRef = verseRef;
        this.verseStyle = verseStyle;
        this.visibility = visibility;
        this.pins = pins;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateGalpi(Boolean galpiAuto, String galpiService) {
        this.galpiAuto = galpiAuto;
        this.galpiService = galpiService;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
