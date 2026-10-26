package com.kanban.domain.talent.controller;

import com.kanban.domain.talent.dto.TalentDto;
import com.kanban.domain.talent.service.TalentWalletService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 노트 챌린지 — 지갑. 계약서: docs/Tech/sermon-challenge-api.md §1 */
@RestController
@RequestMapping("/api/v1/challenge")
@RequiredArgsConstructor
public class ChallengeWalletController {

    private final TalentWalletService walletService;

    @GetMapping("/wallet")
    public ResponseEntity<TalentDto.Wallet> wallet(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(walletService.wallet(principal.getUserId()));
    }

    @GetMapping("/ledger")
    public ResponseEntity<TalentDto.LedgerPage> ledger(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String before,
            @RequestParam(required = false) Integer limit) {
        Instant cursor = null;
        if (before != null && !before.isBlank()) {
            try {
                cursor = Instant.parse(before);
            } catch (DateTimeParseException e) {
                throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
            }
        }
        return ResponseEntity.ok(walletService.ledger(principal.getUserId(), cursor, limit));
    }

    @PostMapping("/exchange")
    public ResponseEntity<TalentDto.Wallet> exchange(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody TalentDto.ExchangeRequest request) {
        return ResponseEntity.ok(walletService.exchange(principal.getUserId(), request.getCredits()));
    }
}
