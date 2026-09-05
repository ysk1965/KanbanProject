package com.kanban.domain.checklist;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 보드 스코프 체크리스트 프리셋 (이름 + 항목 제목 목록).
 * 태스크에 "적용"하면 항목들이 그 태스크의 체크리스트로 복사 생성된다 —
 * 스냅샷 원칙: 프리셋을 나중에 수정해도 이미 적용된 태스크의 체크리스트는 바뀌지 않는다.
 */
@Entity
@Table(name = "checklist_presets", indexes = {
    @Index(name = "idx_checklist_preset_board_id", columnList = "board_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChecklistPreset extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "icon", length = 16)
    private String icon;

    @OneToMany(mappedBy = "preset", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @Builder.Default
    private List<ChecklistPresetItem> items = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String name, String icon) {
        if (name != null) this.name = name;
        this.icon = icon;
    }

    /** 항목 드래프트 (제목 + 담당자 user id) — 전체 교체 입력값 */
    public record ItemDraft(String title, String assigneeId) {}

    /** 항목 전체 교체 (PUT full replace). orphanRemoval로 기존 행은 삭제된다. */
    public void replaceItems(List<ItemDraft> drafts) {
        this.items.clear();
        int order = 0;
        for (ItemDraft draft : drafts) {
            this.items.add(ChecklistPresetItem.builder()
                    // 응답 DTO가 flush 전에 만들어지므로 @PrePersist에 맡기지 않고 즉시 발급 —
                    // id가 null이면 프론트 행 key가 전부 겹쳐 항목별 편집이 깨진다
                    .id(UUID.randomUUID().toString())
                    .preset(this)
                    .title(draft.title())
                    .assigneeId(draft.assigneeId())
                    .sortOrder(order++)
                    .build());
        }
    }
}
