package com.kanban.domain.church;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

/**
 * 내 소속 교회. 빼면 church_id 만 null 로 두고 행은 남긴다 — changed_at(마지막 바꾼 시각)으로 30일 제한을 건다.
 */
@Entity
@Table(name = "user_churches", indexes = @Index(name = "idx_uc_church", columnList = "church_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserChurch extends BaseTimeEntity {

    @Id
    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "church_id", length = 36)
    private String churchId;

    @Column(name = "dept", length = 20)
    private String dept;

    @Column(name = "changed_at")
    private LocalDateTime changedAt;

    public void change(String churchId, String dept, LocalDateTime changedAt) {
        this.churchId = churchId;
        this.dept = dept;
        this.changedAt = changedAt;
    }

    public void updateDept(String dept) {
        this.dept = dept;
    }
}
