package com.kanban.domain.personal.controller;

import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/personal-space")
@RequiredArgsConstructor
public class PersonalSpaceController {

    private final UserRepository userRepository;

    @PostMapping("/activate")
    @Transactional
    public ResponseEntity<Map<String, Object>> activatePersonalSpace(
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        if (Boolean.TRUE.equals(user.getPersonalSpaceEnabled())) {
            throw new BusinessException(ErrorCode.PERSONAL_SPACE_ALREADY_ENABLED);
        }

        user.enablePersonalSpace();
        userRepository.save(user);

        return ResponseEntity.ok(Map.of(
                "personal_space_enabled", true
        ));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        return ResponseEntity.ok(Map.of(
                "personal_space_enabled", Boolean.TRUE.equals(user.getPersonalSpaceEnabled())
        ));
    }
}
