package com.kanban.domain.user.controller;

import com.kanban.domain.user.User;
import com.kanban.domain.user.dto.ChangePasswordRequest;
import com.kanban.domain.user.dto.UpdateProfileRequest;
import com.kanban.domain.user.service.UserService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * 현재 사용자 정보 조회
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getMe(@AuthenticationPrincipal UserPrincipal principal) {
        User user = userService.getUser(principal.getUserId());
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "name", user.getName(),
                "profile_image", user.getProfileImage() != null ? user.getProfileImage() : "",
                "email_verified", user.getEmailVerified(),
                "theme", user.getTheme() != null ? user.getTheme() : "dark"
        ));
    }

    /**
     * 프로필 수정
     */
    @PatchMapping("/me")
    public ResponseEntity<Map<String, Object>> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody UpdateProfileRequest request
    ) {
        User user = userService.updateProfile(principal.getUserId(), request);
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "name", user.getName(),
                "profile_image", user.getProfileImage() != null ? user.getProfileImage() : "",
                "email_verified", user.getEmailVerified(),
                "theme", user.getTheme() != null ? user.getTheme() : "dark"
        ));
    }

    /**
     * 비밀번호 변경
     */
    @PostMapping("/me/password")
    public ResponseEntity<Map<String, String>> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        userService.changePassword(principal.getUserId(), request);
        return ResponseEntity.ok(Map.of("message", "비밀번호가 변경되었습니다"));
    }

    /**
     * 계정 탈퇴
     */
    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteAccount(@AuthenticationPrincipal UserPrincipal principal) {
        userService.deleteAccount(principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "계정이 삭제되었습니다"));
    }
}
