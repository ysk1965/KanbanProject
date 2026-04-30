package com.kanban.domain.contractor.entity;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.jobrole.entity.JobRole;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "board_contractors", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"board_id", "name"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardContractor {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_member_id")
    private BoardMember manager;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_role_id")
    private JobRole jobRole;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void updateInfo(String name, String color) {
        if (name != null) this.name = name;
        if (color != null) this.color = color;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateManager(BoardMember manager) {
        this.manager = manager;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateJobRole(JobRole jobRole) {
        this.jobRole = jobRole;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
