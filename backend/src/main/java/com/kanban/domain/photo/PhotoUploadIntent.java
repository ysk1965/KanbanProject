package com.kanban.domain.photo;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * presigned PUT URL 을 발급했지만 아직 confirm 되지 않은 사진 업로드.
 * confirm 시 삭제되고, 만료까지 confirm 되지 않으면 스케줄러가 S3 객체와 함께 정리한다.
 */
@Entity
@Table(name = "photo_upload_intents",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_photo_upload_intent_s3_key", columnNames = "s3_key")
        },
        indexes = {
                @Index(name = "idx_photo_upload_intent_expires", columnList = "expires_at")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PhotoUploadIntent {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    @Column(name = "thumbnail_key", nullable = false, length = 500)
    private String thumbnailKey;

    @Column(name = "organization_id", nullable = false, length = 36)
    private String organizationId;

    @Column(name = "tab_id", nullable = false, length = 36)
    private String tabId;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, length = 50)
    private String contentType;

    @Column(name = "uploaded_by", length = 36)
    private String uploadedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
