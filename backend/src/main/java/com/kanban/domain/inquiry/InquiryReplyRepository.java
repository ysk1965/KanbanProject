package com.kanban.domain.inquiry;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface InquiryReplyRepository extends JpaRepository<InquiryReply, String> {

    @Query("SELECT r FROM InquiryReply r LEFT JOIN FETCH r.admin LEFT JOIN FETCH r.user WHERE r.inquiry.id = :inquiryId ORDER BY r.createdAt ASC")
    List<InquiryReply> findByInquiryIdWithAdmin(@Param("inquiryId") String inquiryId);
}
