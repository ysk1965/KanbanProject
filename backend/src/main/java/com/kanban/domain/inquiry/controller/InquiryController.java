package com.kanban.domain.inquiry.controller;

import com.kanban.domain.inquiry.dto.InquiryRequest;
import com.kanban.domain.inquiry.dto.InquiryResponse;
import com.kanban.domain.inquiry.service.InquiryService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inquiries")
@RequiredArgsConstructor
public class InquiryController {

    private final InquiryService inquiryService;

    @PostMapping
    public ResponseEntity<InquiryResponse.Detail> createInquiry(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody InquiryRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inquiryService.createInquiry(principal.getUserId(), request));
    }

    @GetMapping
    public ResponseEntity<List<InquiryResponse.Summary>> getMyInquiries(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inquiryService.getMyInquiries(principal.getUserId()));
    }

    @GetMapping("/{inquiryId}")
    public ResponseEntity<InquiryResponse.Detail> getInquiry(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId) {
        return ResponseEntity.ok(inquiryService.getInquiry(inquiryId, principal.getUserId()));
    }

    @PostMapping("/{inquiryId}/replies")
    public ResponseEntity<InquiryResponse.ReplyDetail> replyToInquiry(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String inquiryId,
            @Valid @RequestBody InquiryRequest.Reply request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inquiryService.userReplyToInquiry(inquiryId, principal.getUserId(), request));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Integer> getUnreadReplyCount(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inquiryService.getUnreadReplyCount(principal.getUserId()));
    }
}
