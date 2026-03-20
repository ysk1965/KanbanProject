package com.kanban.domain.milestone;

import com.kanban.domain.block.Block;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "milestone_block_configs", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"milestone_id", "block_id"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MilestoneBlockConfig {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "block_id", nullable = false)
    private Block block;

    @Column(name = "hidden", nullable = false)
    @Builder.Default
    private Boolean hidden = false;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public static MilestoneBlockConfig create(Milestone milestone, Block block, boolean hidden) {
        return MilestoneBlockConfig.builder()
                .milestone(milestone)
                .block(block)
                .hidden(hidden)
                .build();
    }

    public void updateHidden(boolean hidden) {
        this.hidden = hidden;
    }
}
