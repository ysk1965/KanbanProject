package com.kanban.domain.sermonprofile.controller;

import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.sermonprofile.service.SermonProfileService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 「나의 갈피」 이름표. 계약서: docs/Tech/sermon-profile-api.md */
@RestController
@RequestMapping("/api/v1/sermon-profile")
@RequiredArgsConstructor
public class SermonProfileController {

    private final SermonProfileService profileService;

    @GetMapping("/me")
    public ResponseEntity<SermonProfileDto.Profile> getMe(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(profileService.getMe(principal.getUserId()));
    }

    @PutMapping("/me")
    public ResponseEntity<SermonProfileDto.Profile> putMe(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody SermonProfileDto.Update request) {
        return ResponseEntity.ok(profileService.putMe(principal.getUserId(), request));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<SermonProfileDto.Profile> get(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String userId) {
        return ResponseEntity.ok(profileService.getOther(principal.getUserId(), userId));
    }
}
