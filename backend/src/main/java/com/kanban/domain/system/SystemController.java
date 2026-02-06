package com.kanban.domain.system;

import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.admin.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/system")
@RequiredArgsConstructor
public class SystemController {

    private final AdminService adminService;

    @GetMapping("/status")
    public ResponseEntity<AdminResponse.MaintenanceStatus> getSystemStatus() {
        return ResponseEntity.ok(adminService.getMaintenanceStatus());
    }

    @GetMapping("/announcements/active")
    public ResponseEntity<List<AdminResponse.AnnouncementDetail>> getActiveAnnouncements() {
        return ResponseEntity.ok(adminService.getActiveAnnouncements());
    }
}
