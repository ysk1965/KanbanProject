package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAnnouncementAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrgAnnouncementAttachmentRepository extends JpaRepository<OrgAnnouncementAttachment, String> {
    List<OrgAnnouncementAttachment> findByAnnouncementId(String announcementId);
    void deleteByAnnouncementId(String announcementId);
}
