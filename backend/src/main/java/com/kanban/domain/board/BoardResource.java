package com.kanban.domain.board;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "board_resources",
        indexes = @Index(name = "idx_board_resource_board", columnList = "board_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardResource extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "url", nullable = false, length = 2000)
    private String url;

    @Column(name = "description", length = 255)
    private String description;

    @Column(name = "favicon_url", length = 500)
    private String faviconUrl;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String url, String description) {
        this.title = title;
        this.url = url;
        this.description = description;
    }

    public void updateFaviconUrl(String faviconUrl) {
        this.faviconUrl = faviconUrl;
    }

    public void updateDisplayOrder(int order) {
        this.displayOrder = order;
    }
}
