package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgAnnouncementCommentRequest;
import com.kanban.domain.organization.dto.OrgAnnouncementCommentResponse;
import com.kanban.domain.organization.dto.OrgAnnouncementRequest;
import com.kanban.domain.organization.dto.OrgAnnouncementResponse;
import com.kanban.domain.organization.repository.OrgAnnouncementAttachmentRepository;
import com.kanban.domain.organization.repository.OrgAnnouncementCommentRepository;
import com.kanban.domain.organization.repository.OrgAnnouncementRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgAnnouncementService {

    private final OrgAnnouncementRepository announcementRepository;
    private final OrgAnnouncementCommentRepository commentRepository;
    private final OrgAnnouncementAttachmentRepository attachmentRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;
    private final FileUploadService fileUploadService;

    private static final int MAX_ATTACHMENTS = 5;

    public OrgAnnouncementResponse.ListResponse getAnnouncements(String orgId, String userId,
                                                                   LocalDateTime cursor, int limit) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<OrgAnnouncement> items;
        if (cursor != null) {
            items = announcementRepository.findByOrgIdWithCursor(orgId, cursor, PageRequest.of(0, limit + 1));
        } else {
            items = announcementRepository.findByOrgId(orgId, PageRequest.of(0, limit + 1));
        }

        boolean hasMore = items.size() > limit;
        List<OrgAnnouncement> trimmed = hasMore ? items.subList(0, limit) : items;

        // Bulk fetch comment counts
        Map<String, Integer> commentCounts = new HashMap<>();
        if (!trimmed.isEmpty()) {
            List<String> ids = trimmed.stream().map(OrgAnnouncement::getId).toList();
            commentRepository.countByAnnouncementIds(ids).forEach(row -> {
                commentCounts.put((String) row[0], ((Long) row[1]).intValue());
            });
        }

        LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                : null;

        List<OrgAnnouncementResponse.Detail> details = trimmed.stream()
                .map(a -> OrgAnnouncementResponse.Detail.of(a, commentCounts.getOrDefault(a.getId(), 0),
                        fileUploadService::resolveUrl))
                .toList();

        return OrgAnnouncementResponse.ListResponse.builder()
                .announcements(details)
                .hasMore(hasMore)
                .nextCursor(nextCursor)
                .build();
    }

    @Transactional
    public OrgAnnouncementResponse.Detail create(String orgId, String userId,
                                                  OrgAnnouncementRequest.Create request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        List<String> fileKeys = request.getFileKeys();
        if (fileKeys != null && fileKeys.size() > MAX_ATTACHMENTS) {
            throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
        }

        OrgAnnouncement announcement = OrgAnnouncement.builder()
                .organization(org)
                .author(member)
                .title(request.getTitle())
                .content(request.getContent())
                .isPinned(request.getIsPinned() != null ? request.getIsPinned() : false)
                .build();
        announcementRepository.save(announcement);

        // Process file attachments
        if (fileKeys != null && !fileKeys.isEmpty()) {
            processFileKeys(fileKeys, orgId, announcement);
        }

        // Log activity
        orgActivityService.log(org, member.getUser().getName(),
                OrgActivityType.ANNOUNCEMENT_POSTED, request.getTitle(), null);

        log.info("Announcement created: orgId={}, id={}, attachments={}", orgId, announcement.getId(),
                announcement.getAttachments().size());
        return OrgAnnouncementResponse.Detail.of(announcement, fileUploadService::resolveUrl);
    }

    @Transactional
    public OrgAnnouncementResponse.Detail update(String orgId, String announcementId, String userId,
                                                  OrgAnnouncementRequest.Update request) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        announcement.update(request.getTitle(), request.getContent());

        // Handle attachment removal: delete attachments not in keepAttachmentIds
        if (request.getKeepAttachmentIds() != null) {
            Set<String> keepIds = Set.copyOf(request.getKeepAttachmentIds());
            List<OrgAnnouncementAttachment> toRemove = announcement.getAttachments().stream()
                    .filter(att -> !keepIds.contains(att.getId()))
                    .toList();

            for (OrgAnnouncementAttachment att : toRemove) {
                fileUploadService.delete(att.getS3Key());
                if (att.getThumbnailS3Key() != null) {
                    fileUploadService.delete(att.getThumbnailS3Key());
                }
                announcement.getAttachments().remove(att);
                attachmentRepository.delete(att);
                log.info("Announcement attachment removed during edit: {}", att.getId());
            }
        }

        // Add new file attachments
        List<String> newFileKeys = request.getNewFileKeys();
        if (newFileKeys != null && !newFileKeys.isEmpty()) {
            int totalAfter = announcement.getAttachments().size() + newFileKeys.size();
            if (totalAfter > MAX_ATTACHMENTS) {
                throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
            }
            processFileKeys(newFileKeys, orgId, announcement);
        }

        int count = (int) commentRepository.countByAnnouncementId(announcementId);
        log.info("Announcement updated: orgId={}, id={}, attachments={}", orgId, announcementId,
                announcement.getAttachments().size());
        return OrgAnnouncementResponse.Detail.of(announcement, count, fileUploadService::resolveUrl);
    }

    @Transactional
    public void delete(String orgId, String announcementId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        // Delete attachment files from storage
        for (OrgAnnouncementAttachment attachment : announcement.getAttachments()) {
            fileUploadService.delete(attachment.getS3Key());
            if (attachment.getThumbnailS3Key() != null) {
                fileUploadService.delete(attachment.getThumbnailS3Key());
            }
        }

        announcementRepository.delete(announcement);
        log.info("Announcement deleted: orgId={}, id={}", orgId, announcementId);
    }

    @Transactional
    public OrgAnnouncementResponse.Detail togglePin(String orgId, String announcementId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        announcement.togglePin();
        int count = (int) commentRepository.countByAnnouncementId(announcementId);
        return OrgAnnouncementResponse.Detail.of(announcement, count, fileUploadService::resolveUrl);
    }

    // ── Comment CRUD ──

    public OrgAnnouncementCommentResponse.ListResponse getComments(String orgId, String announcementId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));
        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        List<OrgAnnouncementComment> comments = commentRepository.findByAnnouncementId(announcementId);
        return OrgAnnouncementCommentResponse.ListResponse.of(comments);
    }

    @Transactional
    public OrgAnnouncementCommentResponse.Detail addComment(String orgId, String announcementId, String userId,
                                                              OrgAnnouncementCommentRequest.Create request) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));
        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        OrgAnnouncementComment comment = OrgAnnouncementComment.builder()
                .announcement(announcement)
                .author(member)
                .content(request.getContent())
                .build();
        commentRepository.save(comment);

        log.info("Announcement comment added: orgId={}, announcementId={}, commentId={}", orgId, announcementId, comment.getId());
        return OrgAnnouncementCommentResponse.Detail.of(comment);
    }

    @Transactional
    public OrgAnnouncementCommentResponse.Detail updateComment(String orgId, String announcementId,
                                                                 String commentId, String userId,
                                                                 OrgAnnouncementCommentRequest.Update request) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnnouncementComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_FOUND));

        if (!comment.getAnnouncement().getId().equals(announcementId) ||
            !comment.getAnnouncement().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_FOUND);
        }

        if (!comment.getAuthor().getId().equals(member.getId())) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_AUTHOR);
        }

        comment.updateContent(request.getContent());
        return OrgAnnouncementCommentResponse.Detail.of(comment);
    }

    @Transactional
    public void deleteComment(String orgId, String announcementId, String commentId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnnouncementComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_FOUND));

        if (!comment.getAnnouncement().getId().equals(announcementId) ||
            !comment.getAnnouncement().getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_FOUND);
        }

        // Author or admin can delete
        boolean isAuthor = comment.getAuthor().getId().equals(member.getId());
        boolean isAdmin = member.isAdminOrAbove();
        if (!isAuthor && !isAdmin) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_COMMENT_NOT_AUTHOR);
        }

        commentRepository.delete(comment);
        log.info("Announcement comment deleted: orgId={}, commentId={}", orgId, commentId);
    }

    /**
     * Process temp file keys into permanent storage + create attachment records
     */
    private void processFileKeys(List<String> fileKeys, String orgId, OrgAnnouncement announcement) {
        List<String> processedKeys = new ArrayList<>();

        try {
            for (String tempKey : fileKeys) {
                // Verify temp file exists
                if (!fileUploadService.tempFileExists(tempKey)) {
                    throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
                }

                FileUploadService.PermanentResult result =
                        fileUploadService.moveToPermanent(tempKey, orgId, announcement.getId());
                processedKeys.add(result.getS3Key());

                // Extract original filename from temp key
                String originalName = tempKey.contains("/")
                        ? tempKey.substring(tempKey.lastIndexOf("/") + 1)
                        : tempKey;

                OrgAnnouncementAttachment attachment = OrgAnnouncementAttachment.builder()
                        .announcement(announcement)
                        .originalFileName(originalName)
                        .s3Key(result.getS3Key())
                        .url(result.getUrl())
                        .thumbnailS3Key(result.getThumbnailS3Key())
                        .thumbnailUrl(result.getThumbnailUrl())
                        .contentType(result.getContentType())
                        .fileSize(result.getFileSize())
                        .build();

                attachmentRepository.save(attachment);
                announcement.getAttachments().add(attachment);
            }
        } catch (Exception e) {
            // Rollback: delete already-moved files
            for (String key : processedKeys) {
                fileUploadService.delete(key);
            }
            throw e;
        }
    }
}
