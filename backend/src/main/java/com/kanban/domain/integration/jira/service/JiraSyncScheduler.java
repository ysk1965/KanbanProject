package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.JiraMilestoneScope;
import com.kanban.domain.integration.jira.JiraMilestoneScopeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JIRA 동기화 스케줄러.
 *  · syncWriteBack — 완료 역동기화(백스톱, 2분).
 *  · pullSync — 블록↔status 매핑/미러 보드의 JIRA status 변화를 BRIDGE로 pull(검토중/완료/반려, 2분).
 * DailyStandupScheduler 패턴을 따른다. (웹훅 근실시간은 Phase 4에서 이 폴링을 백업으로 병행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraSyncScheduler {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraMilestoneScopeRepository scopeRepository;
    private final JiraWriteBackService writeBackService;
    private final JiraImportService importService;
    private final JiraMilestoneScopeService scopeService;

    /** 증분 조회 창에 더하는 여유분 — 직전 pull 이 끝난 뒤 markSynced 까지의 지연과 JIRA 측 시계 오차를 흡수한다. */
    private static final int INCREMENTAL_MARGIN_MINUTES = 5;
    /** 직전 동기화가 이보다 오래됐으면 증분 창이 의미 없으므로 전체 pull 로 간다. */
    private static final Duration MAX_INCREMENTAL_GAP = Duration.ofHours(12);
    /** 이 간격마다 보드당 한 번은 전체 pull — 삭제 재조정과 증분 창의 누락 가능성을 여기서 수습한다. */
    private static final Duration FULL_SYNC_INTERVAL = Duration.ofMinutes(30);

    /**
     * 인스턴스별 마지막 전체 pull 시각(보드 id → 시각). 메모리라 배포 직후·락이 다른 인스턴스로 넘어간 직후는
     * 전체 pull 로 시작한다 — 보수적인 쪽으로 틀리는 것이라 괜찮다.
     */
    private final Map<String, LocalDateTime> lastFullPullAt = new ConcurrentHashMap<>();

    /** 매 2분 실행. */
    @Scheduled(cron = "0 */2 * * * *")
    @SchedulerLock(name = "JiraSyncScheduler.syncWriteBack", lockAtMostFor = "4m", lockAtLeastFor = "30s")
    public void syncWriteBack() {
        List<JiraIntegrationConfig> configs = configRepository.findAllActiveWithWriteBack();
        if (configs.isEmpty()) return;

        for (JiraIntegrationConfig config : configs) {
            try {
                writeBackService.syncBoard(config.getId());
            } catch (Exception e) {
                log.warn("JIRA write-back sync failed for board {}: {}",
                    config.getBoard() != null ? config.getBoard().getId() : config.getId(), e.getMessage());
            }
        }
    }

    /**
     * 매 2분 pull 폴링 — 매핑된 보드의 JIRA 이슈를 재동기화(업서트)해 status 변화를 반영한다.
     * 업서트가 곧 pull이므로 재가져오기를 그대로 재사용(연결한 사용자를 행위자로).
     * write-back(2분)과 주기를 정렬. 웹훅 미설정 보드(미러 포함)의 백업 반영 지연을 줄인다.
     *
     * <p>평소에는 {@code lastSyncedAt} 이후(여유 5분) 갱신분만 조회하는 증분 pull 이고,
     * 30분에 한 번·최초·직전 동기화가 너무 오래된 경우엔 전체 pull 로 삭제 재조정까지 수행한다.
     * 웹훅 단건 pull 도 lastSyncedAt 을 올리므로 폴링이 한동안 실패한 뒤엔 창이 좁게 잡힐 수 있는데,
     * 그 누락은 다음 전체 pull 이 메운다.
     */
    @Scheduled(cron = "0 */2 * * * *")
    @SchedulerLock(name = "JiraSyncScheduler.pullSync", lockAtMostFor = "4m", lockAtLeastFor = "30s")
    public void pullSync() {
        List<JiraIntegrationConfig> configs = configRepository.findAllActivePollable();
        if (configs.isEmpty()) return;

        for (JiraIntegrationConfig config : configs) {
            String boardId = config.getBoard() != null ? config.getBoard().getId() : null;
            String actorId = config.getConnectedBy() != null ? config.getConnectedBy().getId() : null;
            if (boardId == null || actorId == null) continue;

            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
            Integer sinceMinutes = resolveIncrementalWindow(boardId, config.getLastSyncedAt(), now);
            try {
                importService.pullIssues(boardId, actorId, sinceMinutes);
                if (sinceMinutes == null) lastFullPullAt.put(boardId, now);
            } catch (Exception e) {
                log.warn("JIRA pull sync failed for board {} ({}): {}", boardId,
                    sinceMinutes == null ? "full" : "since " + sinceMinutes + "m", e.getMessage());
            }
            // 전용 프로젝트 스코프 — 보드 프로젝트 JQL엔 잡히지 않으므로 스코프별로 따로 pull한다.
            for (JiraMilestoneScope scope : scopeRepository.findActiveByBoardId(boardId)) {
                if (!scope.hasOwnProject()) continue;
                try {
                    importService.pullScopeIssues(boardId, actorId, scope.getMilestone().getId(), sinceMinutes);
                } catch (Exception e) {
                    log.warn("JIRA scope pull failed for board {} milestone {}: {}",
                        boardId, scope.getMilestone().getId(), e.getMessage());
                }
            }
            // 마일스톤 스코프 소속(claim) 갱신 — 본 동기화와 독립적으로 수렴(멱등, 스코프 없으면 no-op).
            try {
                scopeService.claimAllForBoard(boardId);
            } catch (Exception e) {
                log.warn("JIRA scope claim failed for board {}: {}", boardId, e.getMessage());
            }
        }
    }

    /**
     * 이번 주기를 증분으로 돌릴지 결정한다. null = 전체 pull.
     * 증분이면 "직전 동기화 이후 경과 분 + 여유 5분" 을 돌려준다.
     */
    private Integer resolveIncrementalWindow(String boardId, LocalDateTime lastSyncedAt, LocalDateTime now) {
        if (lastSyncedAt == null) return null;
        Duration sinceLast = Duration.between(lastSyncedAt, now);
        if (sinceLast.isNegative() || sinceLast.compareTo(MAX_INCREMENTAL_GAP) > 0) return null;

        LocalDateTime lastFull = lastFullPullAt.get(boardId);
        if (lastFull == null || Duration.between(lastFull, now).compareTo(FULL_SYNC_INTERVAL) >= 0) return null;

        return (int) sinceLast.toMinutes() + INCREMENTAL_MARGIN_MINUTES;
    }
}
