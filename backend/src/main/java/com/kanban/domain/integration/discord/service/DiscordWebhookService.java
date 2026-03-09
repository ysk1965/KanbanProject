package com.kanban.domain.integration.discord.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.discord.MemberDiscordWebhook;
import com.kanban.domain.integration.discord.MemberDiscordWebhookRepository;
import com.kanban.domain.integration.discord.dto.DiscordWebhookRequest;
import com.kanban.domain.integration.discord.dto.DiscordWebhookResponse;
import com.kanban.domain.integration.BrandResolver;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DiscordWebhookService {

    private final MemberDiscordWebhookRepository webhookRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    private static final Pattern DISCORD_WEBHOOK_PATTERN =
            Pattern.compile("^https://(discord\\.com|discordapp\\.com)/api/webhooks/\\d+/[\\w-]+$");

    public List<DiscordWebhookResponse.MemberStatus> getWebhookStatuses(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<MemberDiscordWebhook> webhooks = webhookRepository.findByBoardId(boardId);
        return webhooks.stream()
                .map(DiscordWebhookResponse.MemberStatus::of)
                .toList();
    }

    public DiscordWebhookResponse.Detail getMyWebhook(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        return webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .map(DiscordWebhookResponse.Detail::of)
                .orElse(null);
    }

    @Transactional
    public DiscordWebhookResponse.Detail upsertMyWebhook(String boardId, String userId, DiscordWebhookRequest.Upsert request) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        MemberDiscordWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .orElse(null);

        if (webhook != null) {
            // 기존 설정 업데이트: webhook_url이 없으면 기존 URL 유지
            String newUrl = (request.getWebhookUrl() != null && !request.getWebhookUrl().isBlank())
                    ? request.getWebhookUrl() : webhook.getWebhookUrl();
            if (request.getWebhookUrl() != null && !request.getWebhookUrl().isBlank()) {
                validateWebhookUrl(request.getWebhookUrl());
            }
            webhook.update(
                    newUrl,
                    request.getChannelName(),
                    request.getEnabled() != null ? request.getEnabled() : true
            );
        } else {
            // 새 설정 생성: webhook_url 필수
            if (request.getWebhookUrl() == null || request.getWebhookUrl().isBlank()) {
                throw new BusinessException(ErrorCode.DISCORD_WEBHOOK_INVALID_URL);
            }
            validateWebhookUrl(request.getWebhookUrl());

            Board board = boardRepository.findById(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

            webhook = MemberDiscordWebhook.builder()
                    .board(board)
                    .user(user)
                    .webhookUrl(request.getWebhookUrl())
                    .channelName(request.getChannelName())
                    .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                    .build();
        }

        webhookRepository.save(webhook);
        log.info("Discord webhook upserted for user {} on board {}", userId, boardId);
        return DiscordWebhookResponse.Detail.of(webhook);
    }

    @Transactional
    public void deleteMyWebhook(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        MemberDiscordWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISCORD_WEBHOOK_NOT_FOUND));

        webhookRepository.delete(webhook);
        log.info("Discord webhook deleted for user {} on board {}", userId, boardId);
    }

    public DiscordWebhookResponse.TestResult testMyWebhook(String boardId, String userId, String brandName, String originUrl) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        MemberDiscordWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISCORD_WEBHOOK_NOT_FOUND));

        String resolvedUrl = (originUrl != null && !originUrl.isBlank()) ? originUrl : frontendUrl;
        String brand = (brandName != null && !brandName.isBlank()) ? brandName : BrandResolver.resolve(resolvedUrl);

        try {
            // Discord Embed format
            Map<String, Object> payload = Map.of(
                    "embeds", List.of(
                            Map.of(
                                    "title", "🔔 Test Notification",
                                    "description", "BRIDGE 연동 테스트 메시지입니다.",
                                    "color", 5793266,
                                    "fields", List.of(
                                            Map.of("name", "Board", "value", "Test", "inline", true)
                                    ),
                                    "footer", Map.of("text", brand)
                            )
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

            restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
            log.info("Discord test message sent for user {} on board {}", userId, boardId);
            return DiscordWebhookResponse.TestResult.builder()
                    .success(true)
                    .message("테스트 메시지가 전송되었습니다")
                    .build();
        } catch (Exception e) {
            log.warn("Discord test message failed for user {} on board {}: {}", userId, boardId, e.getMessage());
            return DiscordWebhookResponse.TestResult.builder()
                    .success(false)
                    .message("Discord 전송에 실패했습니다. URL을 확인해주세요.")
                    .build();
        }
    }

    private void validateDiscordAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessDiscord()) {
            throw new BusinessException(ErrorCode.DISCORD_PREMIUM_REQUIRED);
        }
    }

    private void validateWebhookUrl(String url) {
        if (url == null || !DISCORD_WEBHOOK_PATTERN.matcher(url).matches()) {
            throw new BusinessException(ErrorCode.DISCORD_WEBHOOK_INVALID_URL);
        }
    }
}
