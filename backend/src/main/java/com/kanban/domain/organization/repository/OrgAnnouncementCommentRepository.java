package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAnnouncementComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrgAnnouncementCommentRepository extends JpaRepository<OrgAnnouncementComment, String> {

    @Query("SELECT c FROM OrgAnnouncementComment c " +
            "JOIN FETCH c.author a JOIN FETCH a.user " +
            "WHERE c.announcement.id = :announcementId " +
            "ORDER BY c.createdAt ASC")
    List<OrgAnnouncementComment> findByAnnouncementId(@Param("announcementId") String announcementId);

    long countByAnnouncementId(String announcementId);

    @Query("SELECT c.announcement.id, COUNT(c) FROM OrgAnnouncementComment c " +
            "WHERE c.announcement.id IN :announcementIds " +
            "GROUP BY c.announcement.id")
    List<Object[]> countByAnnouncementIds(@Param("announcementIds") List<String> announcementIds);

    void deleteByAnnouncementId(String announcementId);
}
