package com.kanban.domain.organization;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "org_announcement_attachments", indexes = {
        @Index(name = "idx_org_announcement_attachment_announcement", columnList = "announcement_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgAnnouncementAttachment extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "announcement_id", nullable = false)
    private OrgAnnouncement announcement;

    @Column(name = "original_file_name", nullable = false)
    private String originalFileName;

    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    @Column(name = "url", nullable = false, length = 500)
    private String url;

    @Column(name = "thumbnail_s3_key", length = 500)
    private String thumbnailS3Key;

    @Column(name = "thumbnail_url", length = 500)
    private String thumbnailUrl;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
