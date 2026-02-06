package com.kanban.domain.inquiry;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InquiryAttachmentRepository extends JpaRepository<InquiryAttachment, String> {

    List<InquiryAttachment> findByInquiryId(String inquiryId);
}
