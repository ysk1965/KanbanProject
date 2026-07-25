package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.BoardReportConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 슬랙 채널 수집에 필요한 것(봇 토큰·채널)을 DB에서 <b>값으로</b> 뽑아낸다.
 *
 * <p>{@link SlackChannelSource}가 이 결과를 받아 HTTP를 <b>트랜잭션 밖에서</b> 친다 —
 * GithubTargetResolver·ConfluenceTargetResolver와 같은 방식이다. 토큰 복호화까지 여기서 끝내
 * 소스가 지연 로딩(lazy) 엔티티를 만질 일이 없게 한다.
 */
@Component
@RequiredArgsConstructor
public class SlackReportTargetResolver {

    private final BoardReportConfigRepository configRepository;
    private final SlackInstallationRepository installationRepository;
    private final SlackOAuthService slackOAuthService;

    /** 수집 대상 채널과 그 채널을 읽을 봇 토큰. 둘 중 하나라도 없으면 plan이 서지 않는다. */
    public record CollectionPlan(String botToken, String channelId, String channelName) {
    }

    @Transactional(readOnly = true)
    public Optional<CollectionPlan> resolve(String boardId) {
        BoardReportConfig config = configRepository.findByBoardId(boardId).orElse(null);
        if (config == null
                || !Boolean.TRUE.equals(config.getSourceSlackEnabled())
                || config.getSourceSlackChannelId() == null
                || config.getSourceSlackChannelId().isBlank()) {
            return Optional.empty();
        }

        Board board = config.getBoard();
        Optional<SlackInstallation> installationOpt = resolveInstallation(board);
        if (installationOpt.isEmpty()) {
            return Optional.empty();
        }

        String botToken = slackOAuthService.decryptBotToken(installationOpt.get());
        return Optional.of(new CollectionPlan(
                botToken, config.getSourceSlackChannelId(), config.getSourceSlackChannelName()));
    }

    /** 게시(ReportSlackPublisher)와 같은 우선순위: 보드 직속 설치 → 없으면 조직 설치. */
    private Optional<SlackInstallation> resolveInstallation(Board board) {
        Optional<SlackInstallation> boardLevel = installationRepository.findActiveByBoardId(board.getId());
        if (boardLevel.isPresent()) {
            return boardLevel;
        }
        if (board.getOrganization() == null) {
            return Optional.empty();
        }
        return installationRepository.findActiveByOrganizationId(board.getOrganization().getId());
    }
}
