package com.kanban.domain.weight;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "weight_levels")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WeightLevel extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "weight", nullable = false)
    private Double weight;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private Boolean isDefault = false;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String name, Double weight, String color, Integer position) {
        if (name != null) this.name = name;
        if (weight != null) this.weight = weight;
        if (color != null) this.color = color;
        if (position != null) this.position = position;
    }

    public void setAsDefault(boolean isDefault) {
        this.isDefault = isDefault;
    }

    public void updatePosition(Integer position) {
        this.position = position;
    }
}
