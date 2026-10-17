package com.kanban.domain.checklist;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "checklist_preset_items", indexes = {
    @Index(name = "idx_checklist_preset_item_preset_id", columnList = "preset_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChecklistPresetItem {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "preset_id", nullable = false)
    private ChecklistPreset preset;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    /** 적용 시 체크 항목의 담당자로 지정할 보드 멤버 user id (없으면 미배정) */
    @Column(name = "assignee_id", length = 36)
    private String assigneeId;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
