package com.kanban.domain.personal;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "personal_task_tags", uniqueConstraints = {
        @UniqueConstraint(name = "uk_personal_task_tag", columnNames = {"personal_task_id", "personal_tag_id"})
}, indexes = {
        @Index(name = "idx_ptt_task", columnList = "personal_task_id"),
        @Index(name = "idx_ptt_tag", columnList = "personal_tag_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalTaskTag {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "personal_task_id", nullable = false)
    private PersonalTask personalTask;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "personal_tag_id", nullable = false)
    private PersonalTag personalTag;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
