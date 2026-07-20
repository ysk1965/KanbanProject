package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.BrandResolver;
import com.kanban.domain.integration.slack.MemberSlackWebhook;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.integration.slack.SlackUserLinkRepository;
import com.kanban.domain.integration.slack.dto.SlackWebhookRequest;
import com.kanban.domain.integration.slack.dto.SlackWebhookResponse;
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
public class SlackWebhookService {

    private final MemberSlackWebhookRepository webhookRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final SlackInstallationRepository installationRepository;
    private final SlackUserLinkRepository userLinkRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    private static final Pattern SLACK_WEBHOOK_PATTERN =
            Pattern.compile("^https://hooks\\.slack\\.com/services/T[A-Za-z0-9]+/B[A-Za-z0-9]+/[A-Za-z0-9]+$");

    public List<SlackWebhookResponse.MemberStatus> getWebhookStatuses(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // "실제로 Slack 알림을 받는가"를 기준으로 각 멤버 상태 계산.
        // 노티 라우팅(SlackNotificationService)과 동일: 앱 설치 시 봇 DM(계정연동 필요),
        // 미설치 시 개인 웹훅 fallback. 계정연동만 한 멤버(웹훅 미등록)도 포함해야 하므로
        // 웹훅 행이 아니라 보드 멤버 전체를 순회한다.
        boolean canAccessSlack = board.canAccessSlack();
        boolean botInstalled = installationRepository.findActiveByBoardId(boardId).isPresent();

        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        List<String> memberUserIds = members.stream().map(m -> m.getUser().getId()).toList();

        Map<String, MemberSlackWebhook> webhookByUser = webhookRepository.findByBoardId(boardId).stream()
                .collect(java.util.stream.Collectors.toMap(w -> w.getUser().getId(), w -> w, (a, b) -> a));
        java.util.Set<String> linkedUserIds = memberUserIds.isEmpty()
                ? java.util.Set.of()
                : userLinkRepository.findByUserIdIn(memberUserIds).stream()
                        .map(l -> l.getUser().getId())
                        .collect(java.util.stream.Collectors.toSet());

        return members.stream().map(m -> {
            String uid = m.getUser().getId();
            MemberSlackWebhook wh = webhookByUser.get(uid);
            boolean webhookEnabled = wh != null && Boolean.TRUE.equals(wh.getEnabled());
            boolean accountLinked = linkedUserIds.contains(uid);
            boolean reachable = canAccessSlack && (botInstalled ? accountLinked : webhookEnabled);
            return SlackWebhookResponse.MemberStatus.builder()
                    .userId(uid)
                    .connected(wh != null)
                    .enabled(webhookEnabled)
                    .channelName(wh != null ? wh.getChannelName() : null)
                    .accountLinked(accountLinked)
                    .botInstalled(botInstalled)
                    .reachable(reachable)
                    .build();
        }).toList();
    }

    public SlackWebhookResponse.Detail getMyWebhook(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateSlackAccess(boardId);

        return webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .map(SlackWebhookResponse.Detail::of)
                .orElse(null);
    }

    @Transactional
    public SlackWebhookResponse.Detail upsertMyWebhook(String boardId, String userId, SlackWebhookRequest.Upsert request) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateSlackAccess(boardId);

        MemberSlackWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
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
                throw new BusinessException(ErrorCode.SLACK_WEBHOOK_INVALID_URL);
            }
            validateWebhookUrl(request.getWebhookUrl());

            Board board = boardRepository.findById(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

            webhook = MemberSlackWebhook.builder()
                    .board(board)
                    .user(user)
                    .webhookUrl(request.getWebhookUrl())
                    .channelName(request.getChannelName())
                    .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                    .build();
        }

        webhookRepository.save(webhook);
        log.info("Slack webhook upserted for user {} on board {}", userId, boardId);
        return SlackWebhookResponse.Detail.of(webhook);
    }

    @Transactional
    public void deleteMyWebhook(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateSlackAccess(boardId);

        MemberSlackWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_WEBHOOK_NOT_FOUND));

        webhookRepository.delete(webhook);
        log.info("Slack webhook deleted for user {} on board {}", userId, boardId);
    }

    public SlackWebhookResponse.TestResult testMyWebhook(String boardId, String userId, String brandName, String originUrl) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateSlackAccess(boardId);

        MemberSlackWebhook webhook = webhookRepository.findByBoardIdAndUserId(boardId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_WEBHOOK_NOT_FOUND));

        String resolvedUrl = (originUrl != null && !originUrl.isBlank()) ? originUrl : frontendUrl;
        String brand = (brandName != null && !brandName.isBlank()) ? brandName : BrandResolver.resolve(resolvedUrl);

        try {
            Map<String, Object> payload = Map.of(
                    "blocks", List.of(
                            Map.of("type", "header",
                                    "text", Map.of("type", "plain_text", "text", "✅ " + brand + " - 연결 테스트", "emoji", true)),
                            Map.of("type", "section",
                                    "text", Map.of("type", "mrkdwn",
                                            "text", "Slack 연동이 정상적으로 설정되었습니다!\n@멘션 알림이 이 채널로 전송됩니다.")),
                            Map.of("type", "context",
                                    "elements", List.of(
                                            Map.of("type", "mrkdwn", "text", "Sent from " + brand)))
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

            restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
            log.info("Slack test message sent for user {} on board {}", userId, boardId);
            return SlackWebhookResponse.TestResult.builder()
                    .success(true)
                    .message("테스트 메시지가 전송되었습니다")
                    .build();
        } catch (Exception e) {
            log.warn("Slack test message failed for user {} on board {}: {}", userId, boardId, e.getMessage());
            return SlackWebhookResponse.TestResult.builder()
                    .success(false)
                    .message("Slack 전송에 실패했습니다. URL을 확인해주세요.")
                    .build();
        }
    }

    private void validateSlackAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessSlack()) {
            throw new BusinessException(ErrorCode.SLACK_PREMIUM_REQUIRED);
        }
    }

    private void validateWebhookUrl(String url) {
        if (url == null || !SLACK_WEBHOOK_PATTERN.matcher(url).matches()) {
            throw new BusinessException(ErrorCode.SLACK_WEBHOOK_INVALID_URL);
        }
    }
}
