package com.kanban.domain.inquiry.service;

import com.kanban.domain.inquiry.*;
import com.kanban.domain.inquiry.dto.InquiryRequest;
import com.kanban.domain.inquiry.dto.InquiryResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InquiryService {

    private static final int MAX_ATTACHMENTS = 5;

    private final InquiryRepository inquiryRepository;
    private final InquiryReplyRepository inquiryReplyRepository;
    private final InquiryAttachmentRepository inquiryAttachmentRepository;
    private final UserRepository userRepository;
    private final FileUploadService fileUploadService;
    private final WebSocketEventService webSocketEventService;

    @Transactional
    public InquiryResponse.Detail createInquiry(String userId, InquiryRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        List<String> fileKeys = request.getFileKeys();
        if (fileKeys != null && fileKeys.size() > MAX_ATTACHMENTS) {
            throw new BusinessException(ErrorCode.ATTACHMENT_LIMIT_EXCEEDED);
        }

        Inquiry inquiry = Inquiry.builder()
                .user(user)
                .title(request.getTitle())
                .content(request.getContent())
                .build();
        inquiryRepository.save(inquiry);

        if (fileKeys != null && !fileKeys.isEmpty()) {
            processFileKeys(fileKeys, inquiry);
        }

        log.info("Inquiry created: {} by user: {}", inquiry.getId(), userId);
        return InquiryResponse.Detail.of(inquiry, List.of());
    }

    public List<InquiryResponse.Summary> getMyInquiries(String userId) {
        List<Inquiry> inquiries = inquiryRepository.findByUserIdWithDetails(userId);
        return inquiries.stream()
                .map(InquiryResponse.Summary::of)
                .collect(Collectors.toList());
    }

    public int getUnreadReplyCount(String userId) {
        return inquiryRepository.countByUserIdAndHasNewReplyTrue(userId);
    }

    @Transactional
    public InquiryResponse.Detail getInquiry(String inquiryId, String userId) {
        Inquiry inquiry = inquiryRepository.findByIdWithDetails(inquiryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INQUIRY_NOT_FOUND));

        if (!inquiry.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.INQUIRY_ACCESS_DENIED);
        }

        // 읽음 처리
        if (inquiry.isHasNewReply()) {
            inquiry.markAsRead();
        }

        List<InquiryReply> replies = inquiryReplyRepository.findByInquiryIdWithAdmin(inquiryId);
        return InquiryResponse.Detail.of(inquiry, replies);
    }

    @Transactional
    public InquiryResponse.ReplyDetail userReplyToInquiry(String inquiryId, String userId, InquiryRequest.Reply request) {
        Inquiry inquiry = inquiryRepository.findById(inquiryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INQUIRY_NOT_FOUND));

        if (!inquiry.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.INQUIRY_ACCESS_DENIED);
        }

        if (inquiry.getStatus() == InquiryStatus.CLOSED) {
            throw new BusinessException(ErrorCode.INQUIRY_CLOSED);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        InquiryReply reply = InquiryReply.builder()
                .inquiry(inquiry)
                .user(user)
                .replyType(ReplyType.USER)
                .content(request.getContent())
                .build();
        inquiryReplyRepository.save(reply);

        if (inquiry.getStatus() == InquiryStatus.RESOLVED) {
            inquiry.updateStatus(InquiryStatus.IN_PROGRESS);
        }

        log.info("User reply created: {} on inquiry: {} by user: {}", reply.getId(), inquiryId, userId);
        return InquiryResponse.ReplyDetail.of(reply);
    }

    // ==================== Admin Methods ====================

    public InquiryResponse.InquiryList getInquiries(int page, int size, InquiryStatus status) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Page<Inquiry> inquiryPage;
        if (status != null) {
            inquiryPage = inquiryRepository.findByStatusWithUser(status, pageable);
        } else {
            inquiryPage = inquiryRepository.findAllWithUser(pageable);
        }

        List<InquiryResponse.Summary> summaries = inquiryPage.getContent().stream()
                .map(InquiryResponse.Summary::of)
                .collect(Collectors.toList());

        return InquiryResponse.InquiryList.builder()
                .inquiries(summaries)
                .total(inquiryPage.getTotalElements())
                .page(page)
                .size(size)
                .build();
    }

    public InquiryResponse.Detail getInquiryForAdmin(String inquiryId) {
        Inquiry inquiry = inquiryRepository.findByIdWithDetails(inquiryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INQUIRY_NOT_FOUND));

        List<InquiryReply> replies = inquiryReplyRepository.findByInquiryIdWithAdmin(inquiryId);
        return InquiryResponse.Detail.of(inquiry, replies);
    }

    @Transactional
    public InquiryResponse.ReplyDetail replyToInquiry(String inquiryId, String adminId, InquiryRequest.Reply request) {
        Inquiry inquiry = inquiryRepository.findById(inquiryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INQUIRY_NOT_FOUND));

        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        InquiryReply reply = InquiryReply.builder()
                .inquiry(inquiry)
                .admin(admin)
                .replyType(ReplyType.ADMIN)
                .content(request.getContent())
                .build();
        inquiryReplyRepository.save(reply);

        // 새 답변 알림 표시
        inquiry.markNewReply();

        if (inquiry.getStatus() == InquiryStatus.PENDING) {
            inquiry.updateStatus(InquiryStatus.IN_PROGRESS);
        }

        log.info("Inquiry reply created: {} on inquiry: {} by admin: {}", reply.getId(), inquiryId, adminId);

        // WebSocket: 문의 작성자에게 새 답변 알림
        String inquiryOwnerId = inquiry.getUser().getId();
        int unreadCount = inquiryRepository.countByUserIdAndHasNewReplyTrue(inquiryOwnerId);
        webSocketEventService.sendGlobalUserEvent(
                inquiryOwnerId,
                BoardEventType.INQUIRY_REPLIED,
                Map.of("inquiry_id", inquiryId, "unread_count", unreadCount)
        );

        return InquiryResponse.ReplyDetail.of(reply);
    }

    @Transactional
    public InquiryResponse.Detail updateInquiryStatus(String inquiryId, InquiryRequest.UpdateStatus request) {
        Inquiry inquiry = inquiryRepository.findByIdWithDetails(inquiryId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INQUIRY_NOT_FOUND));

        inquiry.updateStatus(request.getStatus());
        log.info("Inquiry status updated: {} to {}", inquiryId, request.getStatus());

        List<InquiryReply> replies = inquiryReplyRepository.findByInquiryIdWithAdmin(inquiryId);
        return InquiryResponse.Detail.of(inquiry, replies);
    }

    // ==================== Helper ====================

    private void processFileKeys(List<String> fileKeys, Inquiry inquiry) {
        List<String> processedKeys = new ArrayList<>();

        try {
            for (String tempKey : fileKeys) {
                if (!fileUploadService.tempFileExists(tempKey)) {
                    throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
                }

                FileUploadService.PermanentResult result =
                        fileUploadService.moveToPermanent(tempKey, "inquiries", inquiry.getId());
                processedKeys.add(result.getS3Key());

                String originalName = tempKey.contains("/")
                        ? tempKey.substring(tempKey.lastIndexOf("/") + 1)
                        : tempKey;

                InquiryAttachment attachment = InquiryAttachment.builder()
                        .inquiry(inquiry)
                        .originalFileName(originalName)
                        .s3Key(result.getS3Key())
                        .url(result.getUrl())
                        .thumbnailS3Key(result.getThumbnailS3Key())
                        .thumbnailUrl(result.getThumbnailUrl())
                        .contentType(result.getContentType())
                        .fileSize(result.getFileSize())
                        .build();

                inquiryAttachmentRepository.save(attachment);
                inquiry.getAttachments().add(attachment);
            }
        } catch (Exception e) {
            for (String key : processedKeys) {
                fileUploadService.delete(key);
            }
            throw e;
        }
    }
}
