package com.kanban.domain.storage;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 스토리지 파일 (이미지/영상/문서). folder_id == null 이면 루트에 위치.
 * OrgPhoto 의 blob 메타데이터 패턴을 채택하되, url 은 저장하지 않고 s3Key 로부터 지연 생성한다
 * (CloudFront 도메인 변경 시 stale 방지).
 */
@Entity
@Table(name = "storage_file",
        indexes = {
                @Index(name = "idx_storage_file_owner", columnList = "owner_user_id, is_deleted"),
                @Index(name = "idx_storage_file_folder", columnList = "folder_id, is_deleted")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StorageFile extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    /** 개인(마이 스페이스) 소유자. board/organization 과 상호배타적. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private User owner;

    @Column(name = "board_id", length = 36)
    private String boardId;

    @Column(name = "organization_id", length = 36)
    private String organizationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private StorageFolder folder;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    @Column(name = "thumbnail_key", length = 500)
    private String thumbnailKey;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    @Builder.Default
    private long fileSize = 0L;

    @Column(name = "width")
    private Integer width;

    @Column(name = "height")
    private Integer height;

    @Column(name = "share_token", length = 36, unique = true)
    private String shareToken;

    @Column(name = "share_code", length = 16, unique = true)
    private String shareCode;

    @Column(name = "is_shared", nullable = false)
    @Builder.Default
    private Boolean isShared = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private Boolean isDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by_id")
    private User deletedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void moveToFolder(StorageFolder newFolder) {
        this.folder = newFolder;
    }

    public void softDelete(User actor) {
        this.isDeleted = true;
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.deletedBy = actor;
    }

    public void restore() {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
    }

    public String enableShare() {
        this.isShared = true;
        if (this.shareToken == null) {
            this.shareToken = UUID.randomUUID().toString();
        }
        if (this.shareCode == null) {
            this.shareCode = ShareCodes.generate();
        }
        return this.shareCode;
    }

    public void disableShare() {
        this.isShared = false;
        this.shareToken = null;
        this.shareCode = null;
    }

    public boolean isImage() {
        return this.contentType != null && this.contentType.startsWith("image/");
    }

    public boolean isVideo() {
        return this.contentType != null && this.contentType.startsWith("video/");
    }
}
