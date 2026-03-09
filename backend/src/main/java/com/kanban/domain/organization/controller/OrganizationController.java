package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.*;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations")
@RequiredArgsConstructor
public class OrganizationController {

    private final OrganizationService organizationService;

    @PostMapping
    public ResponseEntity<OrganizationResponse.Detail> createOrganization(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrganizationRequest.Create request) {
        OrganizationResponse.Detail response = organizationService.createOrganization(
                principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<OrganizationResponse.Simple>> getMyOrganizations(
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrganizationResponse.Simple> response = organizationService.getMyOrganizations(
                principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse.Detail> getOrganization(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrganizationResponse.Detail response = organizationService.getOrganization(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse.Detail> updateOrganization(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrganizationRequest.Update request) {
        OrganizationResponse.Detail response = organizationService.updateOrganization(
                orgId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/logo")
    public ResponseEntity<OrganizationResponse.Detail> uploadLogo(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") MultipartFile file) {
        OrganizationResponse.Detail response = organizationService.uploadLogo(
                orgId, principal.getUserId(), file);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}")
    public ResponseEntity<Map<String, String>> deleteOrganization(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deleteOrganization(orgId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "조직이 삭제되었습니다."));
    }

    @PutMapping("/{orgId}/transfer-ownership")
    public ResponseEntity<OrganizationResponse.Detail> transferOwnership(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrganizationRequest.TransferOwnership request) {
        OrganizationResponse.Detail response = organizationService.transferOwnership(
                orgId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // ==================== Structure Data (Combined) ====================

    @GetMapping("/{orgId}/structure-data")
    public ResponseEntity<OrganizationResponse.StructureData> getStructureData(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrganizationResponse.StructureData response = organizationService.getStructureData(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    // ==================== Structure Settings ====================

    @GetMapping("/{orgId}/structure-settings")
    public ResponseEntity<OrganizationResponse.StructureSettings> getStructureSettings(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrganizationResponse.StructureSettings response = organizationService.getStructureSettings(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{orgId}/structure-settings")
    public ResponseEntity<OrganizationResponse.StructureSettings> updateStructureSettings(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrganizationRequest.UpdateStructureSettings request) {
        OrganizationResponse.StructureSettings response = organizationService.updateStructureSettings(
                orgId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // ==================== Departments ====================

    @GetMapping("/{orgId}/departments")
    public ResponseEntity<List<OrgDepartmentResponse.Detail>> getDepartments(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgDepartmentResponse.Detail> response = organizationService.getDepartments(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/departments")
    public ResponseEntity<OrgDepartmentResponse.Detail> createDepartment(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgDepartmentRequest.Create request) {
        OrgDepartmentResponse.Detail response = organizationService.createDepartment(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{orgId}/departments/{deptId}")
    public ResponseEntity<OrgDepartmentResponse.Detail> updateDepartment(
            @PathVariable String orgId,
            @PathVariable String deptId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgDepartmentRequest.Update request) {
        OrgDepartmentResponse.Detail response = organizationService.updateDepartment(
                orgId, deptId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}/departments/{deptId}")
    public ResponseEntity<Void> deleteDepartment(
            @PathVariable String orgId,
            @PathVariable String deptId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deleteDepartment(orgId, deptId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Job Groups ====================

    @GetMapping("/{orgId}/job-groups")
    public ResponseEntity<List<OrgJobGroupResponse.Detail>> getJobGroups(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgJobGroupResponse.Detail> response = organizationService.getJobGroups(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/job-groups")
    public ResponseEntity<OrgJobGroupResponse.Detail> createJobGroup(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgJobGroupRequest.Create request) {
        OrgJobGroupResponse.Detail response = organizationService.createJobGroup(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{orgId}/job-groups/{jobGroupId}")
    public ResponseEntity<OrgJobGroupResponse.Detail> updateJobGroup(
            @PathVariable String orgId,
            @PathVariable String jobGroupId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgJobGroupRequest.Update request) {
        OrgJobGroupResponse.Detail response = organizationService.updateJobGroup(
                orgId, jobGroupId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}/job-groups/{jobGroupId}")
    public ResponseEntity<Void> deleteJobGroup(
            @PathVariable String orgId,
            @PathVariable String jobGroupId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deleteJobGroup(orgId, jobGroupId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Positions (직책) ====================

    @GetMapping("/{orgId}/positions")
    public ResponseEntity<List<OrgPositionResponse.Detail>> getPositions(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgPositionResponse.Detail> response = organizationService.getPositions(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/positions")
    public ResponseEntity<OrgPositionResponse.Detail> createPosition(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPositionRequest.Create request) {
        OrgPositionResponse.Detail response = organizationService.createPosition(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{orgId}/positions/{positionId}")
    public ResponseEntity<OrgPositionResponse.Detail> updatePosition(
            @PathVariable String orgId,
            @PathVariable String positionId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPositionRequest.Update request) {
        OrgPositionResponse.Detail response = organizationService.updatePosition(
                orgId, positionId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}/positions/{positionId}")
    public ResponseEntity<Void> deletePosition(
            @PathVariable String orgId,
            @PathVariable String positionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deletePosition(orgId, positionId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Titles (직위) ====================

    @GetMapping("/{orgId}/titles")
    public ResponseEntity<List<OrgTitleResponse.Detail>> getTitles(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgTitleResponse.Detail> response = organizationService.getTitles(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/titles")
    public ResponseEntity<OrgTitleResponse.Detail> createTitle(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgTitleRequest.Create request) {
        OrgTitleResponse.Detail response = organizationService.createTitle(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{orgId}/titles/{titleId}")
    public ResponseEntity<OrgTitleResponse.Detail> updateTitle(
            @PathVariable String orgId,
            @PathVariable String titleId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgTitleRequest.Update request) {
        OrgTitleResponse.Detail response = organizationService.updateTitle(
                orgId, titleId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}/titles/{titleId}")
    public ResponseEntity<Void> deleteTitle(
            @PathVariable String orgId,
            @PathVariable String titleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deleteTitle(orgId, titleId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Grades (직급) ====================

    @GetMapping("/{orgId}/grades")
    public ResponseEntity<List<OrgGradeResponse.Detail>> getGrades(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgGradeResponse.Detail> response = organizationService.getGrades(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{orgId}/grades")
    public ResponseEntity<OrgGradeResponse.Detail> createGrade(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgGradeRequest.Create request) {
        OrgGradeResponse.Detail response = organizationService.createGrade(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{orgId}/grades/{gradeId}")
    public ResponseEntity<OrgGradeResponse.Detail> updateGrade(
            @PathVariable String orgId,
            @PathVariable String gradeId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgGradeRequest.Update request) {
        OrgGradeResponse.Detail response = organizationService.updateGrade(
                orgId, gradeId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{orgId}/grades/{gradeId}")
    public ResponseEntity<Void> deleteGrade(
            @PathVariable String orgId,
            @PathVariable String gradeId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.deleteGrade(orgId, gradeId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
