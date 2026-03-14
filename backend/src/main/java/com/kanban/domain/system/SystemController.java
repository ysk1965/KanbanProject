package com.kanban.domain.system;

import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.admin.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/system")
@RequiredArgsConstructor
public class SystemController {

    private final AdminService adminService;
    private final MonetizationService monetizationService;

    @GetMapping("/status")
    public ResponseEntity<AdminResponse.MaintenanceStatus> getSystemStatus() {
        return ResponseEntity.ok(adminService.getMaintenanceStatus());
    }

    @GetMapping("/announcements/active")
    public ResponseEntity<List<AdminResponse.AnnouncementDetail>> getActiveAnnouncements() {
        return ResponseEntity.ok(adminService.getActiveAnnouncements());
    }

    @GetMapping("/monetization")
    public ResponseEntity<Map<String, Boolean>> getMonetizationStatus() {
        return ResponseEntity.ok(Map.of(
            "monetization_enabled", monetizationService.isMonetizationEnabled()
        ));
    }
}
