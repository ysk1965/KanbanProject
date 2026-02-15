package com.kanban.domain.notification.controller;

import com.kanban.domain.inquiry.service.InquiryService;
import com.kanban.domain.notification.dto.NotificationResponse;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final InquiryService inquiryService;

    @GetMapping
    public ResponseEntity<NotificationResponse.ListResponse> getMyNotifications(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String boardId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime cursor,
            @RequestParam(defaultValue = "20") int limit) {
        NotificationResponse.ListResponse response =
                notificationService.getMyNotifications(principal.getUserId(), boardId, cursor, limit);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/unread-count")
    public ResponseEntity<NotificationResponse.UnreadCountResponse> getUnreadCount(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String boardId) {
        NotificationResponse.UnreadCountResponse response =
                notificationService.getUnreadCount(principal.getUserId(), boardId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/unread-counts")
    public ResponseEntity<NotificationResponse.UnreadCountsResponse> getUnreadCounts(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String boardId) {
        NotificationResponse.UnreadCountResponse notifCount =
                notificationService.getUnreadCount(principal.getUserId(), boardId);
        int inquiryCount = inquiryService.getUnreadReplyCount(principal.getUserId());
        return ResponseEntity.ok(NotificationResponse.UnreadCountsResponse.builder()
                .unreadCount(notifCount.getUnreadCount())
                .unreadInquiryCount(inquiryCount)
                .build());
    }

    @PutMapping("/{notificationId}/read")
    public ResponseEntity<NotificationResponse.Detail> markAsRead(
            @PathVariable String notificationId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NotificationResponse.Detail response =
                notificationService.markAsRead(notificationId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/read-all")
    public ResponseEntity<Map<String, String>> markAllAsRead(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String boardId) {
        notificationService.markAllAsRead(principal.getUserId(), boardId);
        return ResponseEntity.ok(Map.of("message", "모든 알림을 읽음 처리했습니다"));
    }
}
