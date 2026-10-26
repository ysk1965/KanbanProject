package com.kanban.domain.church.controller;

import com.kanban.domain.church.dto.ChurchDto;
import com.kanban.domain.church.service.ChurchService;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.ranking.service.RankingProfileService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 교회 검색·등록과 내 소속 교회. 계약서: docs/Tech/sermon-challenge-api.md §3 (카카오 장소 검색은 2단계) */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ChurchController {

    private final ChurchService churchService;
    private final RankingProfileService profileService;

    @GetMapping("/churches")
    public ResponseEntity<ChurchDto.Items> search(
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(churchService.search(q, limit));
    }

    /** 새로 만들면 201, 같은 교회가 있으면 그 교회를 200 */
    @PostMapping("/churches")
    public ResponseEntity<ChurchDto.Item> register(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody ChurchDto.Register request) {
        ChurchDto.Registered r = churchService.register(principal.getUserId(), request);
        return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(r.church());
    }

    @PutMapping("/challenge/church")
    public ResponseEntity<RankingDto.Profile> setMine(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody ChurchDto.SetMine request) {
        churchService.setMine(principal.getUserId(), request.getChurchId(), request.getDept());
        return ResponseEntity.ok(profileService.get(principal.getUserId()));
    }

    @DeleteMapping("/challenge/church")
    public ResponseEntity<RankingDto.Profile> removeMine(@AuthenticationPrincipal UserPrincipal principal) {
        churchService.removeMine(principal.getUserId());
        return ResponseEntity.ok(profileService.get(principal.getUserId()));
    }
}
