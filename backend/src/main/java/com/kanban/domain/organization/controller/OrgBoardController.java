package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgBoardRequest;
import com.kanban.domain.organization.dto.OrgBoardResponse;
import com.kanban.domain.organization.service.OrganizationFacadeService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/boards")
@RequiredArgsConstructor
public class OrgBoardController {

    private final OrganizationFacadeService organizationFacadeService;

    @GetMapping
    public ResponseEntity<List<OrgBoardResponse.Simple>> getOrgBoards(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgBoardResponse.Simple> response = organizationFacadeService.getOrgBoards(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/check-eligibility")
    public ResponseEntity<OrgBoardResponse.EligibilityCheck> checkEligibility(
            @PathVariable String orgId,
            @RequestParam("board_id") String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrgBoardResponse.EligibilityCheck response = organizationFacadeService.checkBoardEligibility(
                orgId, boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<OrgBoardResponse.Simple> addBoard(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgBoardRequest.AddBoard request) {
        OrgBoardResponse.Simple response = organizationFacadeService.addBoardToOrg(
                orgId, request.getBoardId(), principal.getUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/create")
    public ResponseEntity<OrgBoardResponse.Simple> createBoard(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgBoardRequest.CreateBoard request) {
        OrgBoardResponse.Simple response = organizationFacadeService.createBoardForOrg(
                orgId, request, principal.getUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{boardId}")
    public ResponseEntity<Void> removeBoard(
            @PathVariable String orgId,
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationFacadeService.removeBoardFromOrg(orgId, boardId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
