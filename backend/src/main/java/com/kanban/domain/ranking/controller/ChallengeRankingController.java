package com.kanban.domain.ranking.controller;

import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.ranking.service.LeagueService;
import com.kanban.domain.ranking.service.RankingProfileService;
import com.kanban.domain.ranking.service.RankingService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 노트 챌린지 — 프로필 · 랭킹 · 리그. 계약서: docs/Tech/sermon-challenge-api.md §2 · §5 · §6 */
@RestController
@RequestMapping("/api/v1/challenge")
@RequiredArgsConstructor
public class ChallengeRankingController {

    private final RankingProfileService profileService;
    private final RankingService rankingService;
    private final LeagueService leagueService;

    @GetMapping("/profile")
    public ResponseEntity<RankingDto.Profile> profile(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(profileService.get(principal.getUserId()));
    }

    @PutMapping("/profile")
    public ResponseEntity<RankingDto.Profile> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody RankingDto.UpdateProfile request) {
        return ResponseEntity.ok(profileService.update(principal.getUserId(), request));
    }

    @GetMapping("/rankings")
    public ResponseEntity<RankingDto.Board> rankings(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String scope,
            @RequestParam(name = "group_id", required = false) String groupId,
            @RequestParam(required = false) String board,
            @RequestParam(required = false) String week) {
        LocalDate weekKey = null;
        if (week != null && !week.isBlank()) {
            try {
                weekKey = LocalDate.parse(week);
            } catch (DateTimeParseException e) {
                throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
            }
        }
        return ResponseEntity.ok(rankingService.rankings(principal.getUserId(), scope, groupId, board, weekKey));
    }

    @GetMapping("/league")
    public ResponseEntity<RankingDto.League> league(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(leagueService.get(principal.getUserId()));
    }
}
